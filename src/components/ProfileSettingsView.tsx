import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Crop,
  KeyRound,
  Mail,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  calculateDailyQuestionProgress,
  calculateExamCountdown,
  computeAvatarCropSourceRect,
  computeCropPanFromImagePoint,
  DAILY_GOAL_PRESETS,
  DEFAULT_DAILY_QUESTION_GOAL,
  DEFAULT_TOPNOTCHER_TARGET_PERCENT,
  extractFirstName,
  extractProfileInitials,
  formatDateInputValue,
  formatThresholdPercent,
  getSuggestedExamDates,
  MAX_AVATAR_CROP_ZOOM,
  MAX_DAILY_QUESTION_GOAL,
  MAX_TOPNOTCHER_TARGET_PERCENT,
  MIN_AVATAR_CROP_ZOOM,
  MIN_DAILY_QUESTION_GOAL,
  MIN_TOPNOTCHER_TARGET_PERCENT,
  normalizeTopnotcherThreshold,
  parseLocalExamDate,
  QuestionAttemptLog,
  TOPNOTCHER_THRESHOLD_PRESETS,
} from '../utils/bleppLogic';
import {
  sendPasswordResetEmailLink,
  updateAccountPassword,
} from '../supabaseClient';

export interface ProfileSettingsUpdatePayload {
  profileName: string;
  profileAvatar: string | null;
  dailyQuestionGoal: number;
  examDate: string;
  topnotcherThreshold: number;
}

interface ProfileSettingsViewProps {
  profileName: string;
  profileAvatar: string | null;
  dailyQuestionGoal: number;
  topnotcherThreshold: number;
  examDate: string | null;
  userEmail: string | null;
  attemptLogs: QuestionAttemptLog[];
  isPasswordRecoveryActive?: boolean;
  onPasswordRecoveryComplete?: () => void;
  onSaveProfile: (payload: ProfileSettingsUpdatePayload) => void;
  onBackToHome: () => void;
  onDeleteAccount: () => Promise<{ ok: boolean; error?: string }>;
}

interface LoadedCropImage {
  srcDataUrl: string;
  sourceCanvas: HTMLCanvasElement;
  naturalWidth: number;
  naturalHeight: number;
}

interface CropStageLayout {
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
  scale: number;
}

function computeStageLayout(
  canvasWidth: number,
  canvasHeight: number,
  naturalWidth: number,
  naturalHeight: number
): CropStageLayout {
  const pad = 16;
  const availW = Math.max(40, canvasWidth - pad * 2);
  const availH = Math.max(40, canvasHeight - pad * 2);
  const scale = Math.min(availW / naturalWidth, availH / naturalHeight);
  const drawW = naturalWidth * scale;
  const drawH = naturalHeight * scale;
  const drawX = (canvasWidth - drawW) / 2;
  const drawY = (canvasHeight - drawH) / 2;
  return { drawX, drawY, drawW, drawH, scale };
}

function normalizeDrawableToCropImage(
  drawable: CanvasImageSource,
  rawWidth: number,
  rawHeight: number
): LoadedCropImage {
  const maxDim = 1600;
  const safeRawW = Math.max(1, Math.round(rawWidth));
  const safeRawH = Math.max(1, Math.round(rawHeight));
  const downscale =
    Math.max(safeRawW, safeRawH) > maxDim
      ? maxDim / Math.max(safeRawW, safeRawH)
      : 1;
  const naturalWidth = Math.max(1, Math.round(safeRawW * downscale));
  const naturalHeight = Math.max(1, Math.round(safeRawH * downscale));

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = naturalWidth;
  sourceCanvas.height = naturalHeight;
  const ctx = sourceCanvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, naturalWidth, naturalHeight);
    ctx.drawImage(drawable, 0, 0, naturalWidth, naturalHeight);
  }
  const srcDataUrl = sourceCanvas.toDataURL('image/jpeg', 0.92);
  return {
    srcDataUrl,
    sourceCanvas,
    naturalWidth,
    naturalHeight,
  };
}

async function loadImageFromDataUrl(srcDataUrl: string): Promise<LoadedCropImage> {
  return new Promise<LoadedCropImage>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.max(1, img.naturalWidth || img.width || 256);
      const h = Math.max(1, img.naturalHeight || img.height || 256);
      resolve(normalizeDrawableToCropImage(img, w, h));
    };
    img.onerror = () => reject(new Error('Invalid image file format.'));
    img.src = srcDataUrl;
  });
}

async function readImageFileForCrop(file: File): Promise<LoadedCropImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      const normalized = normalizeDrawableToCropImage(
        bitmap,
        bitmap.width,
        bitmap.height
      );
      bitmap.close();
      return normalized;
    } catch {
      // Fall back to FileReader + HTMLImageElement below
    }
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read uploaded image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read uploaded image file.'));
    reader.readAsDataURL(file);
  });

  return loadImageFromDataUrl(rawDataUrl);
}

function renderCroppedAvatarDataUrl(
  loaded: LoadedCropImage,
  zoom: number,
  panX: number,
  panY: number
): string {
  const targetSize = 256;
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return loaded.srcDataUrl;
  }

  const rect = computeAvatarCropSourceRect(
    loaded.naturalWidth,
    loaded.naturalHeight,
    zoom,
    panX,
    panY
  );
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.drawImage(
    loaded.sourceCanvas,
    rect.sx,
    rect.sy,
    rect.sSide,
    rect.sSide,
    0,
    0,
    targetSize,
    targetSize
  );
  return canvas.toDataURL('image/jpeg', 0.9);
}

export const ProfileSettingsView: React.FC<ProfileSettingsViewProps> = ({
  profileName,
  profileAvatar,
  dailyQuestionGoal,
  topnotcherThreshold,
  examDate,
  userEmail,
  attemptLogs,
  isPasswordRecoveryActive = false,
  onPasswordRecoveryComplete,
  onSaveProfile,
  onBackToHome,
  onDeleteAccount,
}) => {
  const [nameDraft, setNameDraft] = useState<string>(profileName || '');
  const [avatarDraft, setAvatarDraft] = useState<string | null>(profileAvatar || null);
  const [avatarLoadError, setAvatarLoadError] = useState<boolean>(false);
  const [goalInput, setGoalInput] = useState<string>(
    String(dailyQuestionGoal || DEFAULT_DAILY_QUESTION_GOAL)
  );
  const [topnotcherThresholdInput, setTopnotcherThresholdInput] = useState<string>(
    formatThresholdPercent(topnotcherThreshold || DEFAULT_TOPNOTCHER_TARGET_PERCENT)
  );
  const [examDateDraft, setExamDateDraft] = useState<string>(examDate || '');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [validationError, setValidationError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);
  const [savedBanner, setSavedBanner] = useState<boolean>(false);

  // Interactive photo cropper state
  const [lastRawImage, setLastRawImage] = useState<LoadedCropImage | null>(null);
  const [cropSession, setCropSession] = useState<LoadedCropImage | null>(null);
  const [cropZoom, setCropZoom] = useState<number>(1);
  const [cropPanX, setCropPanX] = useState<number>(0);
  const [cropPanY, setCropPanY] = useState<number>(0);
  const [isDraggingCrop, setIsDraggingCrop] = useState<boolean>(false);

  // Change password (email reset link + recovery completion) states
  const [resetEmailInput, setResetEmailInput] = useState<string>(userEmail || '');
  const [isSendingResetLink, setIsSendingResetLink] = useState<boolean>(false);
  const [resetLinkStatus, setResetLinkStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [newPasswordDraft, setNewPasswordDraft] = useState<string>('');
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState<string>('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState<boolean>(false);
  const [passwordUpdateStatus, setPasswordUpdateStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Account deletion confirmation states
  const [isDeleteExpanded, setIsDeleteExpanded] = useState<boolean>(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState<string>('');
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    setNameDraft(profileName || '');
  }, [profileName]);

  useEffect(() => {
    setAvatarDraft(profileAvatar || null);
    setAvatarLoadError(false);
  }, [profileAvatar]);

  useEffect(() => {
    setGoalInput(String(dailyQuestionGoal || DEFAULT_DAILY_QUESTION_GOAL));
  }, [dailyQuestionGoal]);

  useEffect(() => {
    setTopnotcherThresholdInput(
      formatThresholdPercent(topnotcherThreshold || DEFAULT_TOPNOTCHER_TARGET_PERCENT)
    );
  }, [topnotcherThreshold]);

  useEffect(() => {
    if (userEmail) {
      setResetEmailInput(userEmail);
    }
  }, [userEmail]);

  useEffect(() => {
    if (examDate) {
      setExamDateDraft(examDate);
    }
  }, [examDate]);

  useEffect(() => {
    if (!examDateDraft) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [examDateDraft]);

  const presets = useMemo(() => getSuggestedExamDates(), []);
  const previewFirstName = useMemo(
    () => extractFirstName(nameDraft, userEmail),
    [nameDraft, userEmail]
  );
  const previewInitials = useMemo(
    () => extractProfileInitials(nameDraft, userEmail),
    [nameDraft, userEmail]
  );
  const previewCountdown = useMemo(
    () => calculateExamCountdown(examDateDraft, nowMs),
    [examDateDraft, nowMs]
  );

  const parsedGoalNumber = Number(goalInput);
  const validPreviewGoal =
    Number.isFinite(parsedGoalNumber) &&
    parsedGoalNumber >= MIN_DAILY_QUESTION_GOAL &&
    parsedGoalNumber <= MAX_DAILY_QUESTION_GOAL
      ? Math.round(parsedGoalNumber)
      : dailyQuestionGoal || DEFAULT_DAILY_QUESTION_GOAL;

  const dailyProgress = useMemo(
    () => calculateDailyQuestionProgress(attemptLogs, validPreviewGoal, nowMs),
    [attemptLogs, validPreviewGoal, nowMs]
  );

  const liveCroppedPreviewUrl = useMemo(() => {
    if (!cropSession) return null;
    try {
      return renderCroppedAvatarDataUrl(
        cropSession,
        cropZoom,
        cropPanX,
        cropPanY
      );
    } catch {
      return cropSession.srcDataUrl;
    }
  }, [cropSession, cropZoom, cropPanX, cropPanY]);

  const displayedAvatarUrl = liveCroppedPreviewUrl || avatarDraft;

  // Draw Full-Photo Crop Stage showing the entire uploaded image + draggable crop window
  useEffect(() => {
    if (!cropSession || !cropCanvasRef.current) return;
    const canvas = cropCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const layout = computeStageLayout(
      cw,
      ch,
      cropSession.naturalWidth,
      cropSession.naturalHeight
    );
    const rect = computeAvatarCropSourceRect(
      cropSession.naturalWidth,
      cropSession.naturalHeight,
      cropZoom,
      cropPanX,
      cropPanY
    );

    const selX = layout.drawX + rect.sx * layout.scale;
    const selY = layout.drawY + rect.sy * layout.scale;
    const selSide = rect.sSide * layout.scale;
    const selCenterX = selX + selSide / 2;
    const selCenterY = selY + selSide / 2;
    const selRadius = selSide / 2;

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#0B1320';
    ctx.fillRect(0, 0, cw, ch);

    // 1. Draw the ENTIRE uploaded photo scaled proportionally inside the stage
    ctx.drawImage(
      cropSession.sourceCanvas,
      0,
      0,
      cropSession.naturalWidth,
      cropSession.naturalHeight,
      layout.drawX,
      layout.drawY,
      layout.drawW,
      layout.drawH
    );

    // 2. Dim the unselected portion of the photo outside the chosen square crop box
    ctx.save();
    ctx.beginPath();
    ctx.rect(layout.drawX, layout.drawY, layout.drawW, layout.drawH);
    ctx.rect(selX, selY, selSide, selSide);
    ctx.fillStyle = 'rgba(11, 19, 32, 0.62)';
    ctx.fill('evenodd');
    ctx.restore();

    // 3. Softly shade corners outside the circular avatar silhouette inside the square box
    ctx.save();
    ctx.beginPath();
    ctx.rect(selX, selY, selSide, selSide);
    ctx.arc(selCenterX, selCenterY, selRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(11, 19, 32, 0.28)';
    ctx.fill();
    ctx.restore();

    // 4. Optional rule-of-thirds alignment grid while dragging
    if (isDraggingCrop) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
      ctx.lineWidth = 1.25;
      const step = selSide / 3;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(selX + step * i, selY);
        ctx.lineTo(selX + step * i, selY + selSide);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(selX, selY + step * i);
        ctx.lineTo(selX + selSide, selY + step * i);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 5. Crisp square crop frame + inscribed circular avatar ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(selX, selY, selSide, selSide);

    ctx.beginPath();
    ctx.arc(selCenterX, selCenterY, Math.max(2, selRadius - 1.5), 0, Math.PI * 2);
    ctx.strokeStyle = '#68C7C5';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }, [cropSession, cropZoom, cropPanX, cropPanY, isDraggingCrop]);

  const updateCropFromStagePointer = (
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number
  ) => {
    if (!cropSession) return;
    const bounds = canvas.getBoundingClientRect();
    const cssToCanvasX = canvas.width / Math.max(1, bounds.width);
    const cssToCanvasY = canvas.height / Math.max(1, bounds.height);
    const canvasX = (clientX - bounds.left) * cssToCanvasX;
    const canvasY = (clientY - bounds.top) * cssToCanvasY;

    const layout = computeStageLayout(
      canvas.width,
      canvas.height,
      cropSession.naturalWidth,
      cropSession.naturalHeight
    );

    const imgX = (canvasX - layout.drawX) / Math.max(0.0001, layout.scale);
    const imgY = (canvasY - layout.drawY) / Math.max(0.0001, layout.scale);

    const nextPan = computeCropPanFromImagePoint(
      cropSession.naturalWidth,
      cropSession.naturalHeight,
      cropZoom,
      imgX,
      imgY
    );
    setCropPanX(nextPan.panX);
    setCropPanY(nextPan.panY);
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setSavedBanner(false);

    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose a valid image file (PNG, JPG, WEBP, or GIF).');
      e.target.value = '';
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setPhotoError('Image file is larger than 12 MB. Please select a smaller photo.');
      e.target.value = '';
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const loaded = await readImageFileForCrop(file);
      setLastRawImage(loaded);
      setCropSession(loaded);
      setCropZoom(1);
      setCropPanX(0);
      setCropPanY(0);
    } catch (err: unknown) {
      setPhotoError(
        err instanceof Error ? err.message : 'Unable to process the selected photo.'
      );
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleReopenCrop = async () => {
    setPhotoError(null);
    setSavedBanner(false);
    if (lastRawImage) {
      setCropSession(lastRawImage);
      return;
    }
    if (!avatarDraft) return;
    setIsUploadingPhoto(true);
    try {
      const loaded = await loadImageFromDataUrl(avatarDraft);
      setCropSession(loaded);
      setCropZoom(1);
      setCropPanX(0);
      setCropPanY(0);
    } catch {
      setPhotoError('Unable to open the current photo for cropping. Please upload a new photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleApplyCrop = () => {
    if (!cropSession) return;
    try {
      const croppedDataUrl = renderCroppedAvatarDataUrl(
        cropSession,
        cropZoom,
        cropPanX,
        cropPanY
      );
      setAvatarLoadError(false);
      setAvatarDraft(croppedDataUrl);
      setCropSession(null);
      setSavedBanner(false);
    } catch {
      setPhotoError('Could not crop the selected region. Please try again.');
    }
  };

  const handleQuickHorizontalRegion = (targetPanX: -1 | 0 | 1) => {
    if (!cropSession) return;
    const minDim = Math.min(cropSession.naturalWidth, cropSession.naturalHeight);
    const currentSide = minDim / cropZoom;
    if (targetPanX !== 0 && cropSession.naturalWidth - currentSide < 1) {
      setCropZoom(1.5);
    }
    setCropPanX(targetPanX);
  };

  const handleCropPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!cropSession) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;
    setIsDraggingCrop(true);
    updateCropFromStagePointer(e.currentTarget, e.clientX, e.clientY);
  };

  const handleCropPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!cropSession || activePointerIdRef.current !== e.pointerId) return;
    updateCropFromStagePointer(e.currentTarget, e.clientX, e.clientY);
  };

  const handleCropPointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current === e.pointerId) {
      activePointerIdRef.current = null;
      setIsDraggingCrop(false);
    }
  };

  const handleSendResetEmail = async () => {
    setResetLinkStatus(null);
    setIsSendingResetLink(true);
    try {
      const result = await sendPasswordResetEmailLink(resetEmailInput);
      if (!result.ok) {
        setResetLinkStatus({
          ok: false,
          message: result.error || 'Could not send password reset email.',
        });
      } else {
        setResetLinkStatus({
          ok: true,
          message: `Password reset link sent to ${result.email}. Check your inbox to set a new password.`,
        });
      }
    } finally {
      setIsSendingResetLink(false);
    }
  };

  const handleCompleteNewPassword = async () => {
    setPasswordUpdateStatus(null);
    if (newPasswordDraft.length < 6) {
      setPasswordUpdateStatus({
        ok: false,
        message: 'New password must be at least 6 characters long.',
      });
      return;
    }
    if (newPasswordDraft !== confirmPasswordDraft) {
      setPasswordUpdateStatus({
        ok: false,
        message: 'New password and confirmation do not match.',
      });
      return;
    }
    setIsUpdatingPassword(true);
    try {
      const res = await updateAccountPassword(newPasswordDraft, userEmail || resetEmailInput);
      if (!res.ok) {
        setPasswordUpdateStatus({
          ok: false,
          message: res.error || 'Could not update password.',
        });
      } else {
        setNewPasswordDraft('');
        setConfirmPasswordDraft('');
        setPasswordUpdateStatus({
          ok: true,
          message: 'Your password has been updated.',
        });
        onPasswordRecoveryComplete?.();
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSavedBanner(false);

    const rawGoal = goalInput.trim();
    const numericGoal = Number(rawGoal);
    if (
      !rawGoal ||
      !Number.isFinite(numericGoal) ||
      numericGoal < MIN_DAILY_QUESTION_GOAL ||
      numericGoal > MAX_DAILY_QUESTION_GOAL
    ) {
      setValidationError(
        `Please enter a daily question goal between ${MIN_DAILY_QUESTION_GOAL} and ${MAX_DAILY_QUESTION_GOAL} items.`
      );
      return;
    }

    const rawThreshold = topnotcherThresholdInput.trim();
    const numericThreshold = Number(rawThreshold);
    if (
      !rawThreshold ||
      !Number.isFinite(numericThreshold) ||
      numericThreshold < MIN_TOPNOTCHER_TARGET_PERCENT ||
      numericThreshold > MAX_TOPNOTCHER_TARGET_PERCENT
    ) {
      setValidationError(
        `Please enter a Topnotcher threshold between ${MIN_TOPNOTCHER_TARGET_PERCENT}% and ${MAX_TOPNOTCHER_TARGET_PERCENT}%.`
      );
      return;
    }

    const parsedDate = parseLocalExamDate(examDateDraft);
    if (!parsedDate) {
      setValidationError('Please select a valid BLEPP exam date for your countdown.');
      return;
    }

    let finalAvatar = avatarDraft;
    if (cropSession) {
      try {
        finalAvatar = renderCroppedAvatarDataUrl(
          cropSession,
          cropZoom,
          cropPanX,
          cropPanY
        );
        setAvatarDraft(finalAvatar);
        setAvatarLoadError(false);
        setCropSession(null);
      } catch {
        // Keep existing avatarDraft if canvas export fails
      }
    }

    const normalizedGoal = Math.round(numericGoal);
    const normalizedThreshold = normalizeTopnotcherThreshold(numericThreshold);
    const normalizedExamDate = formatDateInputValue(parsedDate);

    onSaveProfile({
      profileName: nameDraft.trim(),
      profileAvatar: finalAvatar,
      dailyQuestionGoal: normalizedGoal,
      examDate: normalizedExamDate,
      topnotcherThreshold: normalizedThreshold,
    });
    setGoalInput(String(normalizedGoal));
    setTopnotcherThresholdInput(formatThresholdPercent(normalizedThreshold));
    setExamDateDraft(normalizedExamDate);
    setSavedBanner(true);
  };

  const handleConfirmDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') return;
    setDeleteError(null);
    setIsDeletingAccount(true);
    const result = await onDeleteAccount();
    if (!result.ok) {
      setIsDeletingAccount(false);
      setDeleteError(
        result.error || 'Could not complete account deletion. Please try again.'
      );
    }
  };

  return (
    <div className="max-w-[820px] mx-auto space-y-6 sm:space-y-8">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/90 dark:border-[#22324D] pb-4 sm:pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC] tracking-tight">
            Profile Settings
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-[#9FB0C7] mt-1">
            Personalize your greeting, profile photo, daily question target, and BLEPP exam countdown.
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToHome}
          className="self-start sm:self-auto min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-[#293D5C] bg-white dark:bg-[#131F33] hover:bg-slate-50 dark:hover:bg-[#1A2942] text-xs font-semibold text-[#0D254C] dark:text-[#E6ECF5] transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </button>
      </div>

      {/* FORM: IDENTITY, DAILY GOAL & BLEPP EXAM COUNTDOWN */}
      <form
        onSubmit={handleSaveSubmit}
        noValidate
        className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl overflow-hidden transition-colors divide-y divide-slate-200/80 dark:divide-[#22324D]"
      >
        {(validationError || savedBanner) && (
          <div className="px-5 sm:px-6 pt-5">
            {validationError && (
              <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/45 border border-rose-200 dark:border-rose-800/80 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}
            {savedBanner && !validationError && (
              <div
                role="status"
                className="p-3.5 rounded-lg bg-[#E6F4F4] dark:bg-[#112A2D] border border-[#2E7978]/40 dark:border-[#2E7978]/70 flex items-center justify-between gap-3 text-xs text-[#143D3C] dark:text-[#D5F2F1]"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#2E7978] dark:text-[#68C7C5]" />
                  <span className="font-medium">
                    Profile settings saved and synced.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="font-semibold text-[#0D254C] dark:text-[#9CC0F9] hover:underline whitespace-nowrap shrink-0"
                >
                  View Homepage
                </button>
              </div>
            )}
          </div>
        )}

        {/* SECTION 1: PROFILE PHOTO & DISPLAY NAME */}
        <section className="p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-lg font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
              Profile Identity
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#9FB0C7] mt-0.5">
              {userEmail ? `Signed in as ${userEmail}` : 'Customize how BLEPPIFY greets you on the homepage.'}
            </p>
          </div>

          {/* PHOTO UPLOAD ROW */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-20 h-20 rounded-full overflow-hidden border border-slate-200 dark:border-[#2B436B] bg-[#EDF2FA] dark:bg-[#172844] flex items-center justify-center shrink-0">
              {displayedAvatarUrl && !avatarLoadError ? (
                <img
                  src={displayedAvatarUrl}
                  alt={`${previewFirstName} profile photo`}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarLoadError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xl font-label font-bold text-[#0D254C] dark:text-[#9CC0F9]">
                  {previewInitials}
                </span>
              )}
            </div>

            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  ref={fileInputRef}
                  id="profile-photo-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  aria-label="Upload profile photo"
                  onChange={handlePhotoChange}
                  className="sr-only"
                />
                <button
                  type="button"
                  disabled={isUploadingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0D254C] hover:bg-[#163567] dark:bg-[#234B82] dark:hover:bg-[#2C5B9C] disabled:opacity-60 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isUploadingPhoto ? 'Loading Photo...' : 'Upload Photo'}</span>
                </button>

                {avatarDraft && !cropSession && (
                  <button
                    type="button"
                    disabled={isUploadingPhoto}
                    onClick={handleReopenCrop}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-[#293D5C] bg-[#F8FAFC] dark:bg-[#0F1A2C] hover:bg-slate-100 dark:hover:bg-[#1A2942] text-xs font-semibold text-[#0D254C] dark:text-[#E6ECF5] transition-colors whitespace-nowrap"
                  >
                    <Crop className="w-3.5 h-3.5" />
                    <span>Crop Photo</span>
                  </button>
                )}

                {avatarDraft && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarDraft(null);
                      setLastRawImage(null);
                      setCropSession(null);
                      setAvatarLoadError(false);
                      setSavedBanner(false);
                    }}
                    className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-[#293D5C] bg-[#F8FAFC] dark:bg-[#0F1A2C] hover:bg-slate-100 dark:hover:bg-[#1A2942] text-xs font-semibold text-slate-700 dark:text-[#C5D2E3] transition-colors whitespace-nowrap"
                  >
                    Remove Photo
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-[#9FB0C7]">
                JPG, PNG, or WEBP up to 12 MB. Choose and crop any section of your photo.
              </p>
              {photoError && (
                <p className="text-xs font-medium text-rose-700 dark:text-rose-400">
                  {photoError}
                </p>
              )}
            </div>
          </div>

          {/* INTERACTIVE PHOTO CROPPER STUDIO */}
          {cropSession && (
            <div
              role="region"
              aria-label="Crop profile photo"
              className="p-4 sm:p-5 rounded-xl bg-[#F8FAFC] dark:bg-[#0F1A2C] border border-slate-200/90 dark:border-[#293D5C] space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
                    Crop Profile Photo
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-[#9FB0C7]">
                    Click or drag directly on your photo, or adjust zoom and position to choose your exact profile section.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCropZoom(1);
                    setCropPanX(0);
                    setCropPanY(0);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#2E7978] dark:text-[#68C7C5] hover:underline whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </div>

              <div className="flex flex-col md:flex-row items-center md:items-start gap-5">
                <div className="flex flex-col items-center gap-3 shrink-0">
                  <canvas
                    ref={cropCanvasRef}
                    data-testid="avatar-crop-canvas"
                    width={560}
                    height={400}
                    onPointerDown={handleCropPointerDown}
                    onPointerMove={handleCropPointerMove}
                    onPointerUp={handleCropPointerEnd}
                    onPointerCancel={handleCropPointerEnd}
                    className="w-[260px] h-[186px] sm:w-[280px] sm:h-[200px] rounded-xl border border-slate-300 dark:border-[#293D5C] cursor-crosshair touch-none select-none"
                  />
                  {liveCroppedPreviewUrl && (
                    <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-[#9FB0C7]">
                      <img
                        src={liveCroppedPreviewUrl}
                        alt="Selected crop preview"
                        data-testid="avatar-crop-live-preview"
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded-full object-cover border border-[#2E7978]/60 dark:border-[#68C7C5]/70 shrink-0"
                      />
                      <span>Live cropped result</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 w-full space-y-3.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-[#0F172A] dark:text-[#E6ECF5] mr-1">
                      Quick region:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuickHorizontalRegion(-1)}
                      className="min-h-[30px] px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-[#293D5C] bg-white dark:bg-[#131F33] hover:bg-slate-50 dark:hover:bg-[#1A2942] text-[#0D254C] dark:text-[#E6ECF5] transition-colors whitespace-nowrap shrink-0"
                    >
                      Left
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickHorizontalRegion(0)}
                      className="min-h-[30px] px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-[#293D5C] bg-white dark:bg-[#131F33] hover:bg-slate-50 dark:hover:bg-[#1A2942] text-[#0D254C] dark:text-[#E6ECF5] transition-colors whitespace-nowrap shrink-0"
                    >
                      Center
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickHorizontalRegion(1)}
                      className="min-h-[30px] px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-[#293D5C] bg-white dark:bg-[#131F33] hover:bg-slate-50 dark:hover:bg-[#1A2942] text-[#0D254C] dark:text-[#E6ECF5] transition-colors whitespace-nowrap shrink-0"
                    >
                      Right
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label
                        htmlFor="avatar-crop-zoom"
                        className="font-semibold text-[#0F172A] dark:text-[#E6ECF5]"
                      >
                        Zoom
                      </label>
                      <span className="font-mono tabular-nums text-slate-600 dark:text-[#9FB0C7]">
                        {cropZoom.toFixed(2)}×
                      </span>
                    </div>
                    <input
                      id="avatar-crop-zoom"
                      type="range"
                      min={MIN_AVATAR_CROP_ZOOM}
                      max={MAX_AVATAR_CROP_ZOOM}
                      step={0.05}
                      value={cropZoom}
                      onChange={(e) => setCropZoom(Number(e.target.value))}
                      className="w-full accent-[#2E7978]"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label
                        htmlFor="avatar-crop-pan-x"
                        className="font-semibold text-[#0F172A] dark:text-[#E6ECF5]"
                      >
                        Horizontal Position (Left ↔ Right)
                      </label>
                      <span className="font-mono tabular-nums text-slate-600 dark:text-[#9FB0C7]">
                        {Math.round(cropPanX * 100)}%
                      </span>
                    </div>
                    <input
                      id="avatar-crop-pan-x"
                      type="range"
                      min={-100}
                      max={100}
                      step={1}
                      disabled={
                        cropSession.naturalWidth <=
                        Math.min(cropSession.naturalWidth, cropSession.naturalHeight) /
                          cropZoom +
                          0.5
                      }
                      value={Math.round(cropPanX * 100)}
                      onChange={(e) => setCropPanX(Number(e.target.value) / 100)}
                      className="w-full accent-[#0D254C] dark:accent-[#68C7C5] disabled:opacity-40"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <label
                        htmlFor="avatar-crop-pan-y"
                        className="font-semibold text-[#0F172A] dark:text-[#E6ECF5]"
                      >
                        Vertical Position (Top ↕ Bottom)
                      </label>
                      <span className="font-mono tabular-nums text-slate-600 dark:text-[#9FB0C7]">
                        {Math.round(cropPanY * 100)}%
                      </span>
                    </div>
                    <input
                      id="avatar-crop-pan-y"
                      type="range"
                      min={-100}
                      max={100}
                      step={1}
                      disabled={
                        cropSession.naturalHeight <=
                        Math.min(cropSession.naturalWidth, cropSession.naturalHeight) /
                          cropZoom +
                          0.5
                      }
                      value={Math.round(cropPanY * 100)}
                      onChange={(e) => setCropPanY(Number(e.target.value) / 100)}
                      className="w-full accent-[#0D254C] dark:accent-[#68C7C5] disabled:opacity-40"
                    />
                  </div>

                  <div className="pt-1 flex flex-wrap items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setCropSession(null)}
                      className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-[#293D5C] bg-white dark:bg-[#131F33] hover:bg-slate-50 dark:hover:bg-[#1A2942] text-xs font-semibold text-slate-700 dark:text-[#E6ECF5] transition-colors whitespace-nowrap shrink-0"
                    >
                      Cancel Crop
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyCrop}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2E7978] hover:bg-[#246160] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                    >
                      <Crop className="w-3.5 h-3.5" />
                      <span>Apply Crop</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DISPLAY NAME */}
          <div className="space-y-2 pt-1">
            <label
              htmlFor="profile-display-name"
              className="block text-xs font-semibold text-[#0F172A] dark:text-[#E6ECF5]"
            >
              Your Name
            </label>
            <input
              id="profile-display-name"
              type="text"
              maxLength={80}
              placeholder="e.g., Maria Clara Santos"
              value={nameDraft}
              onChange={(e) => {
                setNameDraft(e.target.value);
                setValidationError(null);
                setSavedBanner(false);
              }}
              className="w-full min-h-[44px] px-3.5 py-2 text-base sm:text-sm bg-[#F8FAFC] dark:bg-[#0F1A2C] text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-slate-400 dark:placeholder:text-slate-500 border border-slate-300 dark:border-[#293D5C] rounded-lg focus:border-[#0D254C] dark:focus:border-[#9CC0F9] focus:outline-none transition-colors"
            />
          </div>
        </section>

        {/* SECTION 2: DAILY QUESTIONS / ITEMS GOAL */}
        <section className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-lg font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
                Daily Questions Goal
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#9FB0C7] mt-0.5">
                Set how many board quiz or mock exam items you aim to answer each day.
              </p>
            </div>
            <span className="text-xs font-mono font-semibold tabular-nums text-[#2E7978] dark:text-[#68C7C5]">
              {dailyProgress.answeredToday}/{dailyProgress.dailyGoal} Answered Today
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DAILY_GOAL_PRESETS.map((presetCount) => {
              const isSelected = Number(goalInput) === presetCount;
              return (
                <button
                  key={presetCount}
                  type="button"
                  onClick={() => {
                    setGoalInput(String(presetCount));
                    setValidationError(null);
                    setSavedBanner(false);
                  }}
                  className={`min-h-[40px] px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'bg-[#2E7978] text-white border-[#2E7978]'
                      : 'bg-[#F8FAFC] dark:bg-[#0F1A2C] text-slate-700 dark:text-[#C5D2E3] border-slate-200/90 dark:border-[#293D5C] hover:border-[#2E7978]/55 dark:hover:border-[#68C7C5]/55'
                  }`}
                >
                  <span className="font-mono">{presetCount}</span> items / day
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5 max-w-xs">
            <label
              htmlFor="profile-daily-goal"
              className="block text-xs font-semibold text-[#0F172A] dark:text-[#E6ECF5]"
            >
              Custom Daily Item Target ({MIN_DAILY_QUESTION_GOAL}–{MAX_DAILY_QUESTION_GOAL})
            </label>
            <div className="flex items-center gap-2">
              <input
                id="profile-daily-goal"
                type="number"
                inputMode="numeric"
                min={MIN_DAILY_QUESTION_GOAL}
                max={MAX_DAILY_QUESTION_GOAL}
                step={1}
                value={goalInput}
                onChange={(e) => {
                  setGoalInput(e.target.value);
                  setValidationError(null);
                  setSavedBanner(false);
                }}
                className="w-28 min-h-[42px] px-3.5 py-2 text-base sm:text-sm font-mono font-semibold tabular-nums bg-[#F8FAFC] dark:bg-[#0F1A2C] text-[#0F172A] dark:text-[#F8FAFC] border border-slate-300 dark:border-[#293D5C] rounded-lg focus:border-[#0D254C] dark:focus:border-[#9CC0F9] focus:outline-none"
              />
              <span className="text-xs text-slate-500 dark:text-[#9FB0C7]">
                questions per day
              </span>
            </div>
          </div>
        </section>

        {/* SECTION 2B: TOPNOTCHER BENCHMARK THRESHOLD */}
        <section className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-lg font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
                Topnotcher Threshold
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#9FB0C7] mt-0.5">
                Customize the target percentage used by Topnotcher Mode in Subject Analysis and GWA Calculator.
              </p>
            </div>
            <span className="text-xs font-mono font-semibold tabular-nums text-[#8C4D11] dark:text-[#F2AE63]">
              Target {topnotcherThresholdInput || '90'}%
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TOPNOTCHER_THRESHOLD_PRESETS.map((presetPct) => {
              const isSelected = Number(topnotcherThresholdInput) === presetPct;
              return (
                <button
                  key={presetPct}
                  type="button"
                  onClick={() => {
                    setTopnotcherThresholdInput(String(presetPct));
                    setValidationError(null);
                    setSavedBanner(false);
                  }}
                  className={`min-h-[40px] px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'bg-[#3B2006] dark:bg-[#D9822B] text-white dark:text-[#1C1208] border-[#3B2006] dark:border-[#D9822B]'
                      : 'bg-[#F8FAFC] dark:bg-[#0F1A2C] text-slate-700 dark:text-[#C5D2E3] border-slate-200/90 dark:border-[#293D5C] hover:border-[#D9822B]/65 dark:hover:border-[#F2AE63]/65'
                  }`}
                >
                  <span className="font-mono">{presetPct}%</span> Topnotcher
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5 max-w-xs">
            <label
              htmlFor="profile-topnotcher-threshold"
              className="block text-xs font-semibold text-[#0F172A] dark:text-[#E6ECF5]"
            >
              Custom Topnotcher Target ({MIN_TOPNOTCHER_TARGET_PERCENT}%–{MAX_TOPNOTCHER_TARGET_PERCENT}%)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="profile-topnotcher-threshold"
                type="number"
                inputMode="decimal"
                min={MIN_TOPNOTCHER_TARGET_PERCENT}
                max={MAX_TOPNOTCHER_TARGET_PERCENT}
                step="0.5"
                value={topnotcherThresholdInput}
                onChange={(e) => {
                  setTopnotcherThresholdInput(e.target.value);
                  setValidationError(null);
                  setSavedBanner(false);
                }}
                className="w-28 min-h-[42px] px-3.5 py-2 text-base sm:text-sm font-mono font-semibold tabular-nums bg-[#F8FAFC] dark:bg-[#0F1A2C] text-[#0F172A] dark:text-[#F8FAFC] border border-slate-300 dark:border-[#293D5C] rounded-lg focus:border-[#0D254C] dark:focus:border-[#9CC0F9] focus:outline-none"
              />
              <span className="text-xs text-slate-500 dark:text-[#9FB0C7]">
                % GWA &amp; subject target
              </span>
            </div>
          </div>
        </section>

        {/* SECTION 3: BLEPP EXAM COUNTDOWN DATE */}
        <section className="p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
              BLEPP Exam Countdown Date
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#9FB0C7] mt-0.5">
              Adjust the target examination date shown on your live homescreen countdown.
            </p>
          </div>

          <div className="space-y-2 max-w-sm">
            <label
              htmlFor="profile-exam-date"
              className="block text-xs font-semibold text-[#0F172A] dark:text-[#E6ECF5]"
            >
              Target BLEPP Exam Date
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-[#0D254C] dark:text-[#9CC0F9] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="profile-exam-date"
                type="date"
                required
                value={examDateDraft}
                onChange={(e) => {
                  setExamDateDraft(e.target.value);
                  setValidationError(null);
                  setSavedBanner(false);
                }}
                className="w-full min-h-[44px] pl-10 pr-3.5 py-2 text-base sm:text-sm font-mono font-semibold tabular-nums bg-[#F8FAFC] dark:bg-[#0F1A2C] text-[#0F172A] dark:text-[#F8FAFC] border border-slate-300 dark:border-[#293D5C] rounded-lg focus:border-[#0D254C] dark:focus:border-[#9CC0F9] focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-slate-500 dark:text-[#9FB0C7]">
              Quick schedule presets
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {presets.map((preset) => {
                const isSelected = examDateDraft === preset.dateStr;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setExamDateDraft(preset.dateStr);
                      setValidationError(null);
                      setSavedBanner(false);
                    }}
                    className={`min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap truncate ${
                      isSelected
                        ? 'bg-[#0D254C] dark:bg-[#2E7978] text-white border-[#0D254C] dark:border-[#2E7978]'
                        : 'bg-[#F8FAFC] dark:bg-[#0F1A2C] text-slate-700 dark:text-[#C5D2E3] border-slate-200/90 dark:border-[#293D5C] hover:border-[#0D254C]/45 dark:hover:border-[#9CC0F9]/55'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {previewCountdown && (
            <div className="pt-3 border-t border-slate-200/70 dark:border-[#22324D] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-600 dark:text-[#9FB0C7]">
                <span>Scheduled for </span>
                <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                  {previewCountdown.formattedDate}
                </span>
              </div>

              {previewCountdown.status === 'EXAM_DAY' ? (
                <span className="text-xs font-semibold text-[#2E7978] dark:text-[#68C7C5]">
                  Exam Day is Today
                </span>
              ) : previewCountdown.status === 'PAST' ? (
                <span className="text-xs font-medium text-[#8C4D11] dark:text-[#F2AE63]">
                  Selected date has passed
                </span>
              ) : (
                <div className="flex items-center gap-3 font-mono text-xs font-semibold">
                  <span className="text-[#0D254C] dark:text-[#F8FAFC]">
                    {String(previewCountdown.days).padStart(2, '0')}d
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                  <span className="text-[#0D254C] dark:text-[#F8FAFC]">
                    {String(previewCountdown.hours).padStart(2, '0')}h
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                  <span className="text-[#2E7978] dark:text-[#68C7C5]">
                    {String(previewCountdown.minutes).padStart(2, '0')}m
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                  <span className="text-[#D9822B] dark:text-[#F2AE63]">
                    {String(previewCountdown.seconds).padStart(2, '0')}s
                  </span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* SAVE ACTION FOOTER */}
        <div className="px-5 sm:px-6 py-4 bg-[#EDF2FA]/55 dark:bg-[#172844] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-h-[20px] flex items-center gap-2 text-xs">
            {savedBanner && !validationError && (
              <span className="inline-flex items-center gap-1.5 font-medium text-[#143D3C] dark:text-[#68C7C5]">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#2E7978] dark:text-[#68C7C5]" />
                <span>Saved</span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="font-semibold text-[#0D254C] dark:text-[#9CC0F9] hover:underline"
                >
                  Return to Homepage
                </button>
              </span>
            )}
          </div>
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              type="button"
              onClick={onBackToHome}
              className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-300 dark:border-[#293D5C] bg-white dark:bg-[#131F33] hover:bg-slate-50 dark:hover:bg-[#1A2942] text-xs font-semibold text-slate-700 dark:text-[#E6ECF5] transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[42px] px-5 py-2 rounded-lg bg-[#0D254C] hover:bg-[#163567] dark:bg-[#2E7978] dark:hover:bg-[#378C8B] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
            >
              Save Profile Settings
            </button>
          </div>
        </div>
      </form>

      {/* CHANGE PASSWORD: SEND PASSWORD RESET LINK TO USER EMAIL */}
      <section
        aria-label="Change Password"
        className="bg-white dark:bg-[#131F33] border border-slate-200/90 dark:border-[#22324D] rounded-xl overflow-hidden transition-colors"
      >
        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-display font-semibold text-[#0D254C] dark:text-[#F8FAFC]">
              Change Password
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#9FB0C7] mt-0.5">
              Send a password reset link to your email address to set a new account password.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 space-y-1.5 min-w-0">
              <label
                htmlFor="profile-reset-password-email"
                className="block text-xs font-semibold text-[#0F172A] dark:text-[#E6ECF5]"
              >
                Account Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#0D254C] dark:text-[#9CC0F9] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="profile-reset-password-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={resetEmailInput}
                  onChange={(e) => {
                    setResetEmailInput(e.target.value);
                    setResetLinkStatus(null);
                  }}
                  className="w-full min-h-[42px] pl-10 pr-3.5 py-2 text-base sm:text-sm bg-[#F8FAFC] dark:bg-[#0F1A2C] text-[#0F172A] dark:text-[#F8FAFC] border border-slate-300 dark:border-[#293D5C] rounded-lg focus:border-[#0D254C] dark:focus:border-[#9CC0F9] focus:outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={isSendingResetLink}
              onClick={handleSendResetEmail}
              className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0D254C] hover:bg-[#163567] dark:bg-[#234B82] dark:hover:bg-[#2C5B9C] disabled:opacity-60 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>
                {isSendingResetLink ? 'Sending Link...' : 'Send Password Reset Link'}
              </span>
            </button>
          </div>

          {resetLinkStatus && (
            <div
              role="status"
              className={`p-3 rounded-lg border flex items-start gap-2 text-xs ${
                resetLinkStatus.ok
                  ? 'bg-[#E6F4F4] dark:bg-[#112A2D] border-[#2E7978]/40 dark:border-[#2E7978]/70 text-[#143D3C] dark:text-[#D5F2F1]'
                  : 'bg-rose-50 dark:bg-rose-950/45 border-rose-200 dark:border-rose-800/80 text-rose-800 dark:text-rose-200'
              }`}
            >
              {resetLinkStatus.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#2E7978] dark:text-[#68C7C5]" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{resetLinkStatus.message}</span>
            </div>
          )}

          {isPasswordRecoveryActive && (
            <div className="pt-4 border-t border-slate-200/80 dark:border-[#22324D] space-y-3">
              <div className="text-xs font-semibold text-[#143D3C] dark:text-[#68C7C5]">
                Set New Password
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="recovery-new-password"
                    className="block text-xs font-medium text-[#0F172A] dark:text-[#E6ECF5]"
                  >
                    New Password
                  </label>
                  <input
                    id="recovery-new-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    value={newPasswordDraft}
                    onChange={(e) => {
                      setNewPasswordDraft(e.target.value);
                      setPasswordUpdateStatus(null);
                    }}
                    className="w-full min-h-[42px] px-3.5 py-2 text-base sm:text-sm bg-[#F8FAFC] dark:bg-[#0F1A2C] text-[#0F172A] dark:text-[#F8FAFC] border border-slate-300 dark:border-[#293D5C] rounded-lg focus:border-[#0D254C] dark:focus:border-[#9CC0F9] focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="recovery-confirm-password"
                    className="block text-xs font-medium text-[#0F172A] dark:text-[#E6ECF5]"
                  >
                    Confirm New Password
                  </label>
                  <input
                    id="recovery-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Re-enter new password"
                    value={confirmPasswordDraft}
                    onChange={(e) => {
                      setConfirmPasswordDraft(e.target.value);
                      setPasswordUpdateStatus(null);
                    }}
                    className="w-full min-h-[42px] px-3.5 py-2 text-base sm:text-sm bg-[#F8FAFC] dark:bg-[#0F1A2C] text-[#0F172A] dark:text-[#F8FAFC] border border-slate-300 dark:border-[#293D5C] rounded-lg focus:border-[#0D254C] dark:focus:border-[#9CC0F9] focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  disabled={isUpdatingPassword}
                  onClick={handleCompleteNewPassword}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-[#2E7978] hover:bg-[#246160] disabled:opacity-60 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  {isUpdatingPassword ? 'Updating Password...' : 'Update Password'}
                </button>
              </div>
            </div>
          )}

          {passwordUpdateStatus && (
            <div
              role="status"
              className={`p-3 rounded-lg border flex items-start gap-2 text-xs ${
                passwordUpdateStatus.ok
                  ? 'bg-[#E6F4F4] dark:bg-[#112A2D] border-[#2E7978]/40 dark:border-[#2E7978]/70 text-[#143D3C] dark:text-[#D5F2F1]'
                  : 'bg-rose-50 dark:bg-rose-950/45 border-rose-200 dark:border-rose-800/80 text-rose-800 dark:text-rose-200'
              }`}
            >
              {passwordUpdateStatus.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#2E7978] dark:text-[#68C7C5]" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{passwordUpdateStatus.message}</span>
            </div>
          )}
        </div>
      </section>

      {/* DANGER ZONE: PERMANENT ACCOUNT & SUPABASE USER_ID DELETION */}
      <section
        aria-label="Delete Account"
        className="bg-white dark:bg-[#131F33] border border-rose-200/90 dark:border-rose-900/60 rounded-xl overflow-hidden transition-colors"
      >
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-display font-semibold text-rose-800 dark:text-rose-300">
              Delete Account
            </h2>

            {!isDeleteExpanded && (
              <button
                type="button"
                onClick={() => {
                  setIsDeleteExpanded(true);
                  setDeleteConfirmText('');
                  setDeleteError(null);
                }}
                className="self-start sm:self-center min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-950/70 text-xs font-semibold text-rose-800 dark:text-rose-200 transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Account</span>
              </button>
            )}
          </div>

          {isDeleteExpanded && (
            <div className="pt-4 border-t border-rose-200/70 dark:border-rose-900/50 space-y-4">
              {deleteError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start gap-2 text-xs text-rose-800 dark:text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="space-y-1.5 max-w-sm">
                <label
                  htmlFor="delete-account-confirm"
                  className="block text-xs font-semibold text-rose-900 dark:text-rose-200"
                >
                  Type <span className="font-mono font-bold">DELETE</span> to confirm permanent removal
                </label>
                <input
                  id="delete-account-confirm"
                  type="text"
                  autoComplete="off"
                  placeholder="DELETE"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2 text-base sm:text-sm font-mono bg-[#F8FAFC] dark:bg-[#0F1A2C] text-[#0F172A] dark:text-[#F8FAFC] border border-rose-300 dark:border-rose-800 rounded-lg focus:border-rose-600 dark:focus:border-rose-400 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={isDeletingAccount}
                  onClick={() => {
                    setIsDeleteExpanded(false);
                    setDeleteConfirmText('');
                    setDeleteError(null);
                  }}
                  className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-300 dark:border-[#293D5C] bg-white dark:bg-[#131F33] hover:bg-slate-50 dark:hover:bg-[#1A2942] text-xs font-semibold text-slate-700 dark:text-[#E6ECF5] transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    isDeletingAccount ||
                    deleteConfirmText.trim().toUpperCase() !== 'DELETE'
                  }
                  onClick={handleConfirmDeleteAccount}
                  className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {isDeletingAccount
                      ? 'Deleting Account...'
                      : 'Permanently Delete Account'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
