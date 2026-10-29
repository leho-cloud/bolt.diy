import type { Template } from '~/types/template';
import { STARTER_TEMPLATES } from '~/utils/constants';

const descriptions: Record<string, string> = {
  'Vite React': 'Rugalmas alap oldalakhoz és saját alkalmazásokhoz.',
  'NextJS Shadcn': 'Kész felületelemek összetettebb projektekhez.',
  'Basic Astro': 'Könnyű induló alap tartalmi oldalakhoz.',
};

function TemplateCard({ template }: { template: Template }) {
  return (
    <a
      href={`/starter?template=${encodeURIComponent(template.name)}`}
      className="muhely-template-card"
      aria-label={`${template.label} alap megnyitása`}
    >
      <span className={`muhely-template-icon ${template.icon}`} aria-hidden="true" />
      <div>
        <h3>{template.label}</h3>
        <p>{descriptions[template.name] ?? 'A Bolt saját, AI-val továbbalakítható induló projektje.'}</p>
      </div>
      <span className="i-ph:arrow-up-right" aria-hidden="true" />
    </a>
  );
}

export default function StarterTemplates() {
  const featured = STARTER_TEMPLATES.filter((t) => ['Vite React', 'NextJS Shadcn', 'Basic Astro'].includes(t.name));
  const others = STARTER_TEMPLATES.filter((t) => !featured.includes(t));

  return (
    <section id="kesz-alapok" className="muhely-starters">
      <div className="muhely-section-heading">
        <div>
          <span className="muhely-eyebrow">NEM KELL NULLÁRÓL INDULNOD</span>
          <h2>A Bolt saját induló alapjai</h2>
        </div>
        <span className="muhely-local-note">Válassz alapot, majd alakítsd AI-val</span>
      </div>
      <div className="muhely-template-grid">
        {featured.map((template) => (
          <TemplateCard key={template.name} template={template} />
        ))}
      </div>
      <details className="muhely-more-templates">
        <summary>
          További induló alapok <span>{others.length}</span>
        </summary>
        <div className="muhely-template-grid">
          {others.map((template) => (
            <TemplateCard key={template.name} template={template} />
          ))}
        </div>
      </details>
    </section>
  );
}
