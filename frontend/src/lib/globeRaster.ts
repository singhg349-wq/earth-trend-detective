/** MapLibre image sources use Mercator coordinates; science PNGs are equirectangular.
 * Reproject rows, clipping polar caps at the Web Mercator latitude limit.
 * This changes the display projection only, never the data or colour scale.
 */
const LIMIT = 85.0511287798;
const cache = new Map<string, Promise<string>>();
export function mercatorRaster(url: string, extent: [number,number,number,number]): Promise<string> {
  const key = url+extent.join(',');
  const existing = cache.get(key); if(existing)return existing;
  const promise = (async () => {
    const image = new Image();image.src=url;await image.decode();
    const [,south,,north]=extent;
    const top=Math.min(LIMIT,north), bottom=Math.max(-LIMIT,south);
    const merc=(lat:number)=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
    const mt=merc(top), mb=merc(bottom);
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas is unavailable');
    for(let row=0;row<canvas.height;row++){
      const m=mt+(mb-mt)*(row+0.5)/canvas.height;
      const latitude=(2*Math.atan(Math.exp(m))-Math.PI/2)*180/Math.PI;
      const sy=Math.max(0,Math.min(image.naturalHeight-1,(north-latitude)/(north-south)*image.naturalHeight));
      ctx.drawImage(image,0,sy,image.naturalWidth,1,0,row,canvas.width,1);
    }
    return canvas.toDataURL('image/png');
  })();
  cache.set(key,promise);if(cache.size>700)cache.delete(cache.keys().next().value!);
  void promise.catch(()=>cache.delete(key));return promise;
}
