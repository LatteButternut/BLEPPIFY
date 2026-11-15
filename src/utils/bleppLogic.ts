export interface AvatarCropBox {
  x: number;
  y: number;
  side: number;
}

export type AvatarCropResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

export type AvatarCropQuickRegion =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'bottom';

export function clampAvatarCropBox(
  box: AvatarCropBox,
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  const safeW = Math.max(1, naturalWidth);
  const safeH = Math.max(1, naturalHeight);
  const maxSide = Math.min(safeW, safeH);
  const minSide = Math.max(16, maxSide / MAX_AVATAR_CROP_ZOOM);

  const rawSide = Number.isFinite(box.side) ? box.side : maxSide;
  const side = Math.min(maxSide, Math.max(minSide, rawSide));

  const maxX = Math.max(0, safeW - side);
  const maxY = Math.max(0, safeH - side);

  const rawX = Number.isFinite(box.x) ? box.x : maxX / 2;
  const rawY = Number.isFinite(box.y) ? box.y : maxY / 2;

  return {
    x: Math.min(maxX, Math.max(0, rawX)),
    y: Math.min(maxY, Math.max(0, rawY)),
    side,
  };
}

export function createInitialAvatarCropBox(
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  const safeW = Math.max(1, naturalWidth);
  const safeH = Math.max(1, naturalHeight);
  const maxSide = Math.min(safeW, safeH);
  const side = maxSide * 0.82;
  return clampAvatarCropBox(
    {
      x: (safeW - side) / 2,
      y: (safeH - side) / 2,
      side,
    },
    safeW,
    safeH
  );
}

export function alignAvatarCropBoxToRegion(
  box: AvatarCropBox,
  region: AvatarCropQuickRegion,
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  const safeW = Math.max(1, naturalWidth);
  const safeH = Math.max(1, naturalHeight);
  const maxSide = Math.min(safeW, safeH);
  let side = box.side;

  if (
    ((region === 'left' || region === 'right') && safeW - side < 1) ||
    ((region === 'top' || region === 'bottom') && safeH - side < 1)
  ) {
    side = maxSide * 0.72;
  }

  let x = box.x;
  let y = box.y;

  switch (region) {
    case 'left':
      x = 0;
      break;
    case 'right':
      x = Math.max(0, safeW - side);
      break;
    case 'top':
      y = 0;
      break;
    case 'bottom':
      y = Math.max(0, safeH - side);
      break;
    case 'center':
    default:
      x = (safeW - side) / 2;
      y = (safeH - side) / 2;
      break;
  }

  return clampAvatarCropBox({ x, y, side }, safeW, safeH);
}

export function zoomAvatarCropBoxAroundCenter(
  box: AvatarCropBox,
  zoom: number,
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  const safeW = Math.max(1, naturalWidth);
  const safeH = Math.max(1, naturalHeight);
  const maxSide = Math.min(safeW, safeH);
  const safeZoom = Math.min(
    MAX_AVATAR_CROP_ZOOM,
    Math.max(MIN_AVATAR_CROP_ZOOM, Number.isFinite(zoom) ? zoom : 1)
  );
  const nextSide = maxSide / safeZoom;
  const centerX = box.x + box.side / 2;
  const centerY = box.y + box.side / 2;

  return clampAvatarCropBox(
    {
      x: centerX - nextSide / 2,
      y: centerY - nextSide / 2,
      side: nextSide,
    },
    safeW,
    safeH
  );
}

export function moveAvatarCropBox(
  startBox: AvatarCropBox,
  deltaX: number,
  deltaY: number,
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  return clampAvatarCropBox(
    {
      x: startBox.x + deltaX,
      y: startBox.y + deltaY,
      side: startBox.side,
    },
    naturalWidth,
    naturalHeight
  );
}

export function resizeAvatarCropBoxFromHandle(
  startBox: AvatarCropBox,
  handle: AvatarCropResizeHandle,
  pointerImgX: number,
  pointerImgY: number,
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  const safeW = Math.max(1, naturalWidth);
  const safeH = Math.max(1, naturalHeight);
  const maxSide = Math.min(safeW, safeH);
  const minSide = Math.max(16, maxSide / MAX_AVATAR_CROP_ZOOM);

  let anchorX = startBox.x;
  let anchorY = startBox.y;
  let rawSide = startBox.side;

  if (handle === 'se') {
    anchorX = startBox.x;
    anchorY = startBox.y;
    rawSide = Math.max(pointerImgX - anchorX, pointerImgY - anchorY);
    const side = Math.min(
      Math.min(safeW - anchorX, safeH - anchorY),
      Math.max(minSide, rawSide)
    );
    return clampAvatarCropBox({ x: anchorX, y: anchorY, side }, safeW, safeH);
  }

  if (handle === 'nw') {
    anchorX = startBox.x + startBox.side;
    anchorY = startBox.y + startBox.side;
    rawSide = Math.max(anchorX - pointerImgX, anchorY - pointerImgY);
    const side = Math.min(
      Math.min(anchorX, anchorY),
      Math.max(minSide, rawSide)
    );
    return clampAvatarCropBox(
      { x: anchorX - side, y: anchorY - side, side },
      safeW,
      safeH
    );
  }

  if (handle === 'ne') {
    anchorX = startBox.x;
    anchorY = startBox.y + startBox.side;
    rawSide = Math.max(pointerImgX - anchorX, anchorY - pointerImgY);
    const side = Math.min(
      Math.min(safeW - anchorX, anchorY),
      Math.max(minSide, rawSide)
    );
    return clampAvatarCropBox(
      { x: anchorX, y: anchorY - side, side },
      safeW,
      safeH
    );
  }

  // 'sw'
  anchorX = startBox.x + startBox.side;
  anchorY = startBox.y;
  rawSide = Math.max(anchorX - pointerImgX, pointerImgY - anchorY);
  const side = Math.min(
    Math.min(anchorX, safeH - anchorY),
    Math.max(minSide, rawSide)
  );
  return clampAvatarCropBox(
    { x: anchorX - side, y: anchorY, side },
    safeW,
    safeH
  );
}

export function createAvatarCropBoxFromMarquee(
  startImgX: number,
  startImgY: number,
  currentImgX: number,
  currentImgY: number,
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  const dx = currentImgX - startImgX;
  const dy = currentImgY - startImgY;
  const rawSide = Math.max(Math.abs(dx), Math.abs(dy));
  const x = dx >= 0 ? startImgX : startImgX - rawSide;
  const y = dy >= 0 ? startImgY : startImgY - rawSide;

  return clampAvatarCropBox(
    { x, y, side: rawSide },
    naturalWidth,
    naturalHeight
  );
}

export function centerAvatarCropBoxAtPoint(
  box: AvatarCropBox,
  imgX: number,
  imgY: number,
  naturalWidth: number,
  naturalHeight: number
): AvatarCropBox {
  return clampAvatarCropBox(
    {
      x: imgX - box.side / 2,
      y: imgY - box.side / 2,
      side: box.side,
    },
    naturalWidth,
    naturalHeight
  );
}
