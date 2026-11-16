import { uiText } from '~/lib/common/localization/ui';
import type { Template } from '~/types/template';
import { STARTER_TEMPLATES } from '~/utils/constants';

const descriptions: Record<string, string> = {
  'Vite React': uiText("Rugalmas alap oldalakhoz és saját alkalmazásokhoz.", "A flexible starter for websites and custom apps."),
  'NextJS Shadcn': uiText("Kész felületelemek összetettebb projektekhez.", "Ready-made UI components for more complex projects."),
  'Basic Astro': uiText("Könnyű induló alap tartalmi oldalakhoz.", "A lightweight starter for content-focused sites."),
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
        <p>{descriptions[template.name] ?? uiText("A Bolt saját, AI-val továbbalakítható induló projektje.", "A starter project you can customize with AI.")}</p>
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
          <span className="muhely-eyebrow">{uiText("NEM KELL NULLÁRÓL INDULNOD", "START WITH A TEMPLATE")}</span>
          <h2>{uiText("A Bolt saját induló alapjai", "Starter templates")}</h2>
        </div>
        <span className="muhely-local-note">{uiText("Válassz alapot, majd alakítsd AI-val", "Choose a template and customize it with AI")}</span>
      </div>
      <div className="muhely-template-grid">
        {featured.map((template) => (
          <TemplateCard key={template.name} template={template} />
        ))}
      </div>
      <details className="muhely-more-templates">
        <summary>
          {uiText("További induló alapok", "More templates")} <span>{others.length}</span>
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
