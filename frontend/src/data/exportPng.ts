import { formatPValue } from './inference';
import { SAME_PIPELINE, validationLabel } from './validation';
/**
 * Caption data for PNG export.
 */
export interface PngCaptionData {
  regionLabel: string;
  seasonCode: string;
  seasonYearLabel: string | null;
  periodLabel: string;
  units: string;
  method: string;
  validationStatus: string;
  product: string;
  version: string;
  variable?: string;
  pValue: number | null;
  inferenceAvailable: boolean;
  inferenceReason: string;
  isSubPeriod: boolean;
}

/**
 * Builds the caption text for PNG export.
 */
export function buildPngCaption(data: PngCaptionData): string {
  const lines: string[] = [];

  // Line 1: Region, season, window
  const seasonParts = [data.seasonCode];
  if (data.seasonYearLabel) seasonParts.push(data.seasonYearLabel);
  const seasonText = seasonParts.join(' · ');
  lines.push(`${data.regionLabel} · ${seasonText} · ${data.periodLabel}`);

  // Line 2: Units, method, validation
  const comparison = validationLabel(data.validationStatus) ? SAME_PIPELINE : data.validationStatus;
  lines.push(`Units: ${data.units} · Method: ${data.method} · Comparison: ${comparison}${['aerosol_optical_depth','soil_moisture'].includes(data.variable ?? '') ? '; input reader not separately compared' : ''}`);

  // Line 3: Source
  const sourceText = `Source: ${data.product} v${data.version}${data.variable ? ` · ${data.variable}` : ''}`;
  lines.push(sourceText);

  // Line 4: P-value or sub-period note
  if (data.isSubPeriod) {
    lines.push('sub-period: significance not computed');
  } else if (data.inferenceAvailable && data.pValue !== null) {
    const pStr = formatPValue(data.pValue);
    lines.push(`uncommon if no trend were present, ${pStr.startsWith('<') ? `p ${pStr}` : `p = ${pStr}`}`);
  } else {
    lines.push('unavailable: the artifact did not record an inference result');
  }

  return lines.join('\n');
}

/**
 * Generates the filename for PNG export.
 */
export function buildPngFilename(regionLabel: string, seasonCode: string, periodStart: number, periodEnd: number): string {
  const regionSlug = regionLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `etd_${regionSlug}_${seasonCode}_${periodStart}-${periodEnd}.png`;
}

/**
 * Renders the chart SVG to a canvas and composes the caption.
 * Returns a Promise that resolves to a Blob, or null if canvas rendering fails.
 */
export async function renderChartToPng(
  svgElement: SVGSVGElement,
  caption: string,
  backgroundColor = '#04060e'
): Promise<Blob | null> {
  try {
    // Clone the SVG to avoid modifying the original
    const svgClone = svgElement.cloneNode(true) as SVGSVGElement;

    // Set explicit dimensions
    const vb = svgClone.viewBox.baseVal;
    const width = vb.width || svgClone.clientWidth || 760;
    const height = vb.height || svgClone.clientHeight || 320;

    svgClone.setAttribute('width', String(width));
    svgClone.setAttribute('height', String(height));

    // Ensure dark background
    svgClone.style.backgroundColor = backgroundColor;

    // Serialize SVG to string
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgClone);

    // Create image from SVG
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load SVG image'));
      img.src = url;
    });

    // Calculate caption height (estimate: ~20px per line at 2x scale)
    const captionLines = caption.split('\n');
    const captionHeight = captionLines.length * 20 * 2 + 32; // 2x scale, padding

    // Create canvas at 2x device scale
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round((height + captionHeight / scale) * scale);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      URL.revokeObjectURL(url);
      return null;
    }

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw SVG at 2x scale
    ctx.drawImage(img, 0, 0, canvas.width, Math.round(height * scale));

    // Draw caption
    const captionY = Math.round(height * scale) + 16 * scale;
    ctx.font = `${12 * scale}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#e2e8f0'; // light text on dark
    ctx.textBaseline = 'top';

    for (let i = 0; i < captionLines.length; i++) {
      const lineY = captionY + i * (16 * scale);
      ctx.fillText(captionLines[i], 16 * scale, lineY);
    }

    // Convert to blob
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      }, 'image/png');
    });
  } catch (error) {
    console.warn('PNG render failed, falling back to SVG:', error);
    return null;
  }
}

/**
 * Downloads a blob as a file.
 */
export function downloadBlob(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Downloads SVG as fallback.
 */
export function downloadSvg(svgElement: SVGSVGElement, filename: string): boolean {
  try {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    return downloadBlob(blob, filename.replace(/\.png$/, '.svg'));
  } catch {
    return false;
  }
}
