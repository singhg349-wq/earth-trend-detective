const COLORMAPS: Record<string, string[]> = {
  ylgnbu: ['#ffffd9', '#edf8b1', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#0c2c84'],
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  blues: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'],
};

export function colormapGradient(name: string): string {
  const stops = COLORMAPS[name.toLowerCase()] ?? COLORMAPS.ylgnbu;
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
