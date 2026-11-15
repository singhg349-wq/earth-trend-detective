import { GLOSSARY, type GlossaryTerm } from '../lib/glossary';
import './glossary-page.css';
const REFERENCES: Partial<Record<GlossaryTerm, [string,string]>> = {
  mannKendall:['Hamed & Rao (1998)','https://doi.org/10.1016/S0022-1694(97)00125-X'],
  hamedRao:['Hamed & Rao (1998)','https://doi.org/10.1016/S0022-1694(97)00125-X'],
  senSlope:['Sen (1968)','https://doi.org/10.1080/01621459.1968.10480934'],
  fdr:['Benjamini & Hochberg (1995)','https://doi.org/10.1111/j.2517-6161.1995.tb02031.x'],
  roni:['NOAA CPC RONI data','https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt'],
};
export default function GlossaryPage() {
  return <main className="glossary-page"><p className="ed-eyebrow">Methods & definitions</p><h1>Understand the evidence.</h1><p>Plain-language definitions used throughout TrendTrace.</p><nav aria-label="Glossary terms">{Object.entries(GLOSSARY).map(([key,[title]]) => <a key={key} href={`#glossary/${key}`}>{title}</a>)}</nav>
    {Object.entries(GLOSSARY).map(([key,[title,definition]]) => <section key={key} id={`term-${key}`}><h2>{title}</h2><p>{definition}</p>{REFERENCES[key as GlossaryTerm] && <a href={REFERENCES[key as GlossaryTerm]![1]} target="_blank" rel="noreferrer">{REFERENCES[key as GlossaryTerm]![0]}</a>}</section>)}
    <p>Intervals and statistical tests depend on assumptions. Read the method and independent-check status alongside each result.</p>
  </main>;
}
