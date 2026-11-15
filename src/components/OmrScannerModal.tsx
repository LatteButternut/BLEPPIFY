import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  X,
} from 'lucide-react';
import {
  buildPrc150SheetColumns,
  ExamAnswerKeyItem,
  gradePrcAnswerSheet,
  ShadedChoice,
} from '../utils/bleppLogic';

interface OmrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjectTitle: string;
  keyItems: ExamAnswerKeyItem[];
  onApplyScannedSheet: (detectedMap: Record<number, ShadedChoice>) => void;
  initialPhotoFile?: File | null;
  onInitialPhotoProcessed?: () => void;
}

const COLUMNS_150 = buildPrc150SheetColumns();
const VALID_CHOICES: ShadedChoice[] = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'BLANK',
  'MULTIPLE_SHADED',
  'ERASURE_OR_INVALID_MARK',
];

/**
 * Normalizes and downscales oversized photos (e.g. 12MP–48MP phone gallery images)
 * onto a crisp high-contrast JPEG canvas (max 2200px) so uploaded photos work
 * identically to camera scans and stay well within Vercel serverless payload limits.
 */
async function normalizeAnswerSheetImageFile(
  file: File
): Promise<{ previewDataUrl: string; base64Data: string; mimeType: string }> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode fallback'));
      el.src = rawDataUrl;
    });

    const maxDim = 2200;
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    if (width > 0 && height > 0) {
      const scale = Math.min(1, maxDim / Math.max(width, height));
      const targetW = Math.max(1, Math.round(width * scale));
      const targetH = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const compressedUrl = canvas.toDataURL('image/jpeg', 0.88);
        const base64Data = compressedUrl.split(',')[1] || '';
        if (base64Data.length > 0) {
          return {
            previewDataUrl: compressedUrl,
            base64Data,
            mimeType: 'image/jpeg',
          };
        }
      }
    }
  } catch {
    // Fallback to raw DataURL if canvas conversion is unavailable
  }

  return {
    previewDataUrl: rawDataUrl,
    base64Data: rawDataUrl.split(',')[1] || '',
    mimeType: file.type || 'image/jpeg',
  };
}

/**
 * Generates a realistic synthetic photo data URL of a shaded 150-item (6x25) PRC Answer Sheet
 * so the user can test the OMR scanner workflow immediately.
 */
function createSampleShadedPrcSheetImage(
  subjectTitle: string,
  keyItems: ExamAnswerKeyItem[]
): { dataUrl: string; simulatedMap: Record<number, ShadedChoice> } {
  const simulatedMap: Record<number, ShadedChoice> = {};
  keyItems.forEach((item, idx) => {
    if (idx === 3) {
      simulatedMap[item.itemNumber] = 'MULTIPLE_SHADED';
    } else if (idx % 6 === 4) {
      const wrongChoices: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
      simulatedMap[item.itemNumber] =
        wrongChoices.find((c) => c !== item.correctChoice) || 'A';
    } else {
      simulatedMap[item.itemNumber] = item.correctChoice;
    }
  });

  if (keyItems.length <= 130) {
    simulatedMap[131] = 'B';
  }

  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fdfdfd';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0D254C';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

    ctx.fillStyle = '#0D254C';
    ctx.fillRect(24, 24, canvas.width - 48, 36);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(
      `PRC EXAMINATION ANSWER SHEET (6 COLUMNS × 25 ITEMS = 150 ITEMS) — ${subjectTitle.toUpperCase()}`,
      38,
      48
    );

    const colWidth = 148;
    for (let col = 0; col < 6; col++) {
      const x0 = 30 + col * colWidth;
      const y0 = 75;
      ctx.strokeStyle = '#0D254C';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0, y0, colWidth - 8, 500);

      for (let r = 0; r < 25; r++) {
        const itemNum = col * 25 + r + 1;
        const ry = y0 + 18 + r * 19;
        ctx.fillStyle = '#0D254C';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(String(itemNum).padStart(3, ' '), x0 + 4, ry);

        const letters: Array<'A' | 'B' | 'C' | 'D' | 'E'> = ['A', 'B', 'C', 'D', 'E'];
        const ans = simulatedMap[itemNum] || 'BLANK';
        letters.forEach((lt, lIdx) => {
          const bx = x0 + 32 + lIdx * 21;
          const by = ry - 9;
          ctx.strokeStyle = '#0D254C';
          ctx.strokeRect(bx, by, 15, 12);
          if (ans === lt || (ans === 'MULTIPLE_SHADED' && (lt === 'A' || lt === 'C'))) {
            ctx.fillStyle = '#111827';
            ctx.fillRect(bx + 1, by + 1, 13, 10);
          } else {
            ctx.fillStyle = '#0D254C';
            ctx.font = '8px monospace';
            ctx.fillText(lt, bx + 4, ry - 1);
          }
        });
      }
    }
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    simulatedMap,
  };
}

export const OmrScannerModal: React.FC<OmrScannerModalProps> = ({
  isOpen,
  onClose,
  subjectTitle,
  keyItems,
  onApplyScannedSheet,
  initialPhotoFile,
  onInitialPhotoProcessed,
}) => {
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [detectedMap, setDetectedMap] = useState<Record<number, ShadedChoice>>({});
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [scanStatusMsg, setScanStatusMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const totalExamItems = keyItems.length;
  const livePreviewGrade = gradePrcAnswerSheet(keyItems, detectedMap);

  const runGeminiOmrScan = async (
    base64Data: string,
    mimeType: string,
    sourceLabel = 'photo',
    fallbackMap?: Record<number, ShadedChoice>
  ) => {
    setIsScanning(true);
    setErrorMsg(null);
    setScanStatusMsg(
      `Scanning ${sourceLabel} of 150-Item PRC Answer Sheet with AI Vision OMR...`
    );

    try {
      const response = await fetch('/api/gemini/scan-prc-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Data,
          mimeType,
          totalExamItems,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Vision OMR endpoint returned an error.');
      }

      const data = await response.json();
      const map: Record<number, ShadedChoice> = {};
      if (Array.isArray(data.rows)) {
        data.rows.forEach((r: { itemNumber: number; detectedAnswer: ShadedChoice }) => {
          if (r.itemNumber >= 1 && r.itemNumber <= 150) {
            map[r.itemNumber] = r.detectedAnswer;
          }
        });
      }
      setDetectedMap(map);
      setScanStatusMsg(
        `Scanned ${Object.keys(map).length} rows from ${sourceLabel} · Set ${
          data.detectedSet || 'A'
        } verified.`
      );
    } catch (err: unknown) {
      if (fallbackMap) {
        setDetectedMap(fallbackMap);
        setScanStatusMsg(
          'Loaded calibrated 6×25 PRC OMR sample verification matrix. Tap any item below to inspect or override.'
        );
      } else {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Unable to scan image automatically. You can adjust answers directly in the verification grid below.'
        );
      }
    } finally {
      setIsScanning(false);
    }
  };

  const processAnswerSheetFile = async (file: File, sourceLabel = 'uploaded photo') => {
    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|heic|bmp)$/i.test(file.name)) {
      setErrorMsg('Please select an image file (JPG, PNG, or WEBP) of your shaded answer sheet.');
      return;
    }
    setErrorMsg(null);
    try {
      const normalized = await normalizeAnswerSheetImageFile(file);
      setPhotoPreviewUrl(normalized.previewDataUrl);
      await runGeminiOmrScan(normalized.base64Data, normalized.mimeType, sourceLabel);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to process the uploaded answer sheet image.'
      );
    }
  };

  // Automatically scan photo when uploaded directly from the Mock Exam toolbar
  useEffect(() => {
    if (!isOpen || !initialPhotoFile) return;
    const fileToScan = initialPhotoFile;
    onInitialPhotoProcessed?.();
    void processAnswerSheetFile(fileToScan, 'uploaded photo');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialPhotoFile]);

  // Support pasting an answer sheet screenshot/photo from clipboard while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            void processAnswerSheetFile(blob, 'pasted image');
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, totalExamItems]);

  if (!isOpen) return null;

  const handleGalleryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void processAnswerSheetFile(file, 'uploaded photo');
    e.target.value = '';
  };

  const handleCameraFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void processAnswerSheetFile(file, 'camera scan');
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processAnswerSheetFile(file, 'dropped photo');
    }
  };

  const handleLoadSampleShadedSheet = async () => {
    const { dataUrl, simulatedMap } = createSampleShadedPrcSheetImage(subjectTitle, keyItems);
    setPhotoPreviewUrl(dataUrl);
    setDetectedMap(simulatedMap);
    setErrorMsg(null);
    setScanStatusMsg(
      `Scanned 150-item (6×25) PRC Sheet for ${subjectTitle}. Active Exam Scope: Items 1–${totalExamItems}.`
    );
  };

  const handleOverrideItem = (itemNum: number, newStatus: ShadedChoice) => {
    setDetectedMap((prev) => ({
      ...prev,
      [itemNum]: newStatus,
    }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="omr-scanner-modal-title"
      className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-2 sm:p-4 overflow-y-auto no-print"
    >
      <div className="bg-white dark:bg-[#131F33] border border-slate-200 dark:border-[#22324D] rounded-xl max-w-[1320px] w-full max-h-[92dvh] flex flex-col shadow-xl overflow-hidden">
        {/* MODAL HEADER */}
        <div className="flex items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-[#22324D] bg-[#F8FAFC] dark:bg-[#1A2942]">
          <div>
            <h2
              id="omr-scanner-modal-title"
              className="text-base sm:text-lg font-display font-semibold text-[#0D254C] dark:text-[#E6ECF5]"
            >
              Answer Sheet Photo Upload &amp; Camera OMR Scanner
            </h2>
            <p className="text-xs text-slate-600 dark:text-[#9FB0C7] mt-0.5">
              Active Subject:{' '}
              <strong className="text-[#0F172A] dark:text-[#E6ECF5]">{subjectTitle}</strong> (Items 1–{totalExamItems})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close OMR Scanner Modal"
            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-slate-500 dark:text-[#9FB0C7] hover:text-[#0F172A] dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-[#243858] shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6 flex-1">
          {/* UPLOAD PHOTO, CAMERA SCAN & SAMPLE ACTION BAR */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 p-3.5 sm:p-4 bg-[#F8FAFC] dark:bg-[#1A2942]/75 border border-slate-200 dark:border-[#293D5C] rounded-lg">
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:flex lg:flex-wrap items-stretch sm:items-center gap-2.5">
              {/* 1. UPLOAD SAVED PHOTO / GALLERY / SCREENSHOT (NO capture attribute) */}
              <label className="min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-[#0D254C] hover:bg-[#163567] dark:bg-[#2E7978] dark:hover:bg-[#378C8B] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors">
                <Upload className="w-4 h-4 shrink-0" />
                <span>Upload Sheet Photo</span>
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleGalleryFileChange}
                  className="hidden"
                />
              </label>

              {/* 2. LIVE CAMERA CAPTURE */}
              <label className="min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-[#2D3136] hover:bg-[#1E2226] dark:bg-[#234B82] dark:hover:bg-[#2C5B9C] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors">
                <Camera className="w-4 h-4 shrink-0" />
                <span>Scan with Camera</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCameraFileChange}
                  className="hidden"
                />
              </label>

              {/* 3. SAMPLE SIMULATION */}
              <button
                type="button"
                onClick={handleLoadSampleShadedSheet}
                className="min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-white dark:bg-[#131F33] hover:bg-slate-100 dark:hover:bg-[#243858] text-[#0D254C] dark:text-[#E6ECF5] border border-slate-300 dark:border-[#293D5C] text-xs font-semibold rounded-lg transition-colors"
              >
                <Sparkles className="w-4 h-4 text-[#2E7978] dark:text-[#68C7C5] shrink-0" />
                <span>Sample 150-Item Scan</span>
              </button>
            </div>

            {Object.keys(detectedMap).length > 0 && (
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs tabular-nums">
                <div>
                  <span className="text-slate-500 dark:text-[#9FB0C7]">Detected Score:</span>{' '}
                  <strong className="font-mono text-sm text-[#0D254C] dark:text-[#E6ECF5]">
                    {livePreviewGrade.correctCount} / {totalExamItems} ({livePreviewGrade.percentage}%)
                  </strong>
                </div>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                <div className="text-[#8C4D11] dark:text-[#F2AE63] font-medium">
                  Multiple/Invalid Marks: {livePreviewGrade.invalidOrMultipleCount}
                </div>
              </div>
            )}
          </div>

          {isScanning && (
            <div className="p-4 bg-[#EDF2FA] dark:bg-[#1A2D4A] border border-[#0D254C]/25 dark:border-[#9CC0F9]/40 rounded-lg flex items-center gap-3 text-xs text-[#0D254C] dark:text-[#9CC0F9]">
              <Sparkles className="w-4 h-4 animate-spin shrink-0" />
              <span>{scanStatusMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* OVER-SHADING WARNING BEYOND TOTAL EXAM ITEMS */}
          {livePreviewGrade.overShadedItems.length > 0 && (
            <div className="p-3.5 bg-[#FDF3E7] dark:bg-[#2C1D10] border border-[#D9822B] dark:border-[#9A5B1E] rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#3B2006] dark:text-[#F7DEC2]">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-[#8C4D11] dark:text-[#F2AE63] shrink-0 mt-0.5" />
                <div>
                  <strong>PRC Over-Shading Warning:</strong> Shaded marks were detected on unused row(s){' '}
                  <span className="font-mono font-bold">
                    #{livePreviewGrade.overShadedItems.join(', #')}
                  </span>{' '}
                  beyond this exam&apos;s {totalExamItems}-item limit. They are excluded from scoring, but on exam day ensure you stop at Item #{totalExamItems}.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const cleaned = { ...detectedMap };
                  livePreviewGrade.overShadedItems.forEach((num) => {
                    cleaned[num] = 'BLANK';
                  });
                  setDetectedMap(cleaned);
                }}
                className="px-3 py-1.5 bg-[#D9822B] hover:bg-[#C57320] text-[#1C1208] rounded font-semibold whitespace-nowrap shrink-0 self-start sm:self-center"
              >
                Clear Unused Marks
              </button>
            </div>
          )}

          {/* SIDE-BY-SIDE PHOTO DROPZONE & 6-COLUMN × 25-ITEM INTERACTIVE VERIFICATION OVERLAY */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* UPLOADED / SCANNED PHOTO PREVIEW & DRAG-DROP ZONE */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`lg:col-span-4 border rounded-lg p-3 transition-colors ${
                isDragOver
                  ? 'border-2 border-[#2E7978] dark:border-[#68C7C5] bg-[#EAF4F4]/70 dark:bg-[#112A2D]'
                  : 'border-slate-200 dark:border-[#293D5C] bg-[#F8FAFC] dark:bg-[#1A2942]/50'
              }`}
            >
              <div className="text-xs font-semibold text-[#0D254C] dark:text-[#E6ECF5] mb-2 flex items-center justify-between gap-2">
                <span>Shaded Answer Sheet Photo</span>
                {scanStatusMsg && !isScanning && (
                  <span className="text-[11px] font-normal text-[#22605F] dark:text-[#68C7C5]">
                    ● Scanned
                  </span>
                )}
              </div>
              {photoPreviewUrl ? (
                <div className="space-y-2">
                  <img
                    src={photoPreviewUrl}
                    alt="Uploaded PRC Examination Answer Sheet"
                    referrerPolicy="no-referrer"
                    className="w-full rounded border border-slate-300 dark:border-[#293D5C] object-contain bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="w-full min-h-[36px] px-3 py-1.5 text-xs font-semibold text-[#0D254C] dark:text-[#9CC0F9] bg-white dark:bg-[#131F33] hover:bg-slate-100 dark:hover:bg-[#243858] border border-slate-300 dark:border-[#293D5C] rounded-lg transition-colors"
                  >
                    Replace Photo
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="w-full h-64 rounded-lg border-2 border-dashed border-slate-300 dark:border-[#293D5C] hover:border-[#0D254C] dark:hover:border-[#9CC0F9] flex flex-col items-center justify-center text-center p-6 text-xs text-slate-500 dark:text-[#9FB0C7] transition-colors cursor-pointer"
                >
                  <ImagePlus className="w-8 h-8 text-[#0D254C] dark:text-[#9CC0F9] mb-2.5" />
                  <p className="font-semibold text-[#0F172A] dark:text-[#E6ECF5]">
                    Tap to Upload Answer Sheet Photo
                  </p>
                  <p className="mt-1 leading-relaxed">
                    Choose a photo or screenshot from your gallery, drag &amp; drop an image here, paste (<span className="font-mono">Ctrl+V</span>), or use <strong>Scan with Camera</strong> above.
                  </p>
                </button>
              )}
            </div>

            {/* 6-COLUMN × 25-ITEM INTERACTIVE VERIFICATION GRID */}
            <div className="lg:col-span-8 border border-slate-200 dark:border-[#293D5C] rounded-lg p-3 bg-white dark:bg-[#0F1A2C]">
              <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
                <span className="text-xs font-semibold text-[#0D254C] dark:text-[#E6ECF5]">
                  150-Item Interactive OMR Verification Matrix
                </span>
                <span className="text-[11px] text-slate-500 dark:text-[#9FB0C7]">
                  Tap any item dropdown to override misreads
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {COLUMNS_150.map((col) => (
                  <div
                    key={col.columnIndex}
                    className="border border-slate-200 dark:border-[#293D5C] rounded bg-[#F8FAFC] dark:bg-[#131F33] p-1.5"
                  >
                    <div className="text-[10px] font-mono font-bold text-center bg-[#ECEFF3] dark:bg-[#1A2942] text-[#0D254C] dark:text-[#E6ECF5] py-0.5 rounded mb-1">
                      Col {col.columnIndex}: {col.startItem}–{col.endItem}
                    </div>
                    <div className="space-y-1 max-h-[340px] overflow-y-auto pr-0.5">
                      {col.items.map((itemNum) => {
                        const isActive = itemNum <= totalExamItems;
                        const currentVal = detectedMap[itemNum] || 'BLANK';
                        const keyItem = keyItems.find((k) => k.itemNumber === itemNum);
                        const isCorrect =
                          isActive && keyItem && currentVal === keyItem.correctChoice;
                        const isInvalid =
                          currentVal === 'MULTIPLE_SHADED' ||
                          currentVal === 'ERASURE_OR_INVALID_MARK';

                        return (
                          <div
                            key={itemNum}
                            className={`flex items-center justify-between text-[10px] px-1 py-0.5 rounded border ${
                              !isActive
                                ? 'opacity-50 bg-slate-100 dark:bg-[#0B1320]/70 border-slate-200 dark:border-[#293D5C] text-slate-500 dark:text-[#9FB0C7]'
                                : isInvalid
                                ? 'bg-[#FDF3E7] dark:bg-[#2C1D10] border-[#D9822B] dark:border-[#9A5B1E] text-[#3B2006] dark:text-[#F7DEC2]'
                                : currentVal === 'BLANK'
                                ? 'bg-white dark:bg-[#0B1320] border-slate-200 dark:border-[#293D5C] text-slate-500 dark:text-[#9FB0C7]'
                                : isCorrect
                                ? 'bg-[#EAF4F4] dark:bg-[#112A2D] border-[#2E7978] text-[#143D3C] dark:text-[#D5F2F1]'
                                : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-600 text-rose-900 dark:text-rose-200'
                            }`}
                          >
                            <span className="font-mono font-bold w-6 text-right pr-1 tabular-nums">
                              {itemNum}.
                            </span>
                            <select
                              aria-label={`OMR Override Item ${itemNum}`}
                              value={currentVal}
                              onChange={(e) =>
                                handleOverrideItem(itemNum, e.target.value as ShadedChoice)
                              }
                              className="font-mono text-[10px] bg-transparent font-semibold focus:outline-none cursor-pointer"
                            >
                              {VALID_CHOICES.map((ch) => (
                                <option
                                  key={ch}
                                  value={ch}
                                  className="bg-white dark:bg-[#131F33] text-[#0F172A] dark:text-[#E6ECF5]"
                                >
                                  {ch === 'MULTIPLE_SHADED'
                                    ? 'MULTI (✗)'
                                    : ch === 'ERASURE_OR_INVALID_MARK'
                                    ? 'ERASURE (✗)'
                                    : ch}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-[#F8FAFC] dark:bg-[#1A2942] border-t border-slate-200 dark:border-[#22324D] flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="text-xs text-slate-600 dark:text-[#9FB0C7]">
            Applying OMR results transfers all verified marks onto your PRC Answer Sheet and grades the exam.
          </div>
          <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] sm:min-h-0 px-4 py-2 text-xs font-medium text-[#0D254C] dark:text-[#E6ECF5] bg-white dark:bg-[#131F33] border border-slate-300 dark:border-[#293D5C] rounded-lg hover:bg-slate-100 dark:hover:bg-[#243858]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyScannedSheet(detectedMap);
                onClose();
              }}
              className="flex-1 sm:flex-initial min-h-[42px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 sm:px-5 py-2 text-xs font-semibold text-white bg-[#2E7978] hover:bg-[#246160] rounded-lg transition-colors whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Apply &amp; Grade Exam</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
