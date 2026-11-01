import { describe, expect, it } from 'vitest';
import { withDevelopmentCommentaryWorkstyle } from './prompt-workstyle';
import { withHungarianResponse } from './response-language';
import { discussPrompt } from '~/lib/common/prompts/discuss-prompt';

describe('Műhely response language and discussion scope', () => {
  it('applies the Hungarian default after both legacy and additional instructions', () => {
    const result = withHungarianResponse('Write in English.', 'Keep the task evidence unchanged.');
    expect(result.indexOf('<muhely_response_language>')).toBeGreaterThan(
      result.indexOf('Keep the task evidence unchanged.'),
    );
    expect(result).toContain('Alapértelmezésben magyarul válaszolj');
    expect(result).toContain('kifejezetten más nyelvű választ');
    expect(result).toContain('eszközprotokollokat');
    expect(result).not.toContain('undefined');
  });

  it('retains build tools guidance and preserves the explicit language exception', () => {
    const result = withHungarianResponse(withDevelopmentCommentaryWorkstyle('Use project_patch_file.'));
    expect(result).toContain('Use project_patch_file.');
    expect(result).toContain('<project_mcp_workflow>');
    expect(result).toContain('plain Hungarian Markdown');
    expect(result).toContain('a magyarázatuk legyen magyar');
  });

  it('does not turn a capability question into an implementation task or mandatory action', () => {
    const result = withHungarianResponse(discussPrompt());
    expect(result).toContain('milyen szoftvert tudsz készíteni?');
    expect(result).toContain('Nem kér honlapot, bejelentkezést, regisztrációt vagy megvalósítási tervet');
    expect(result).toContain('Egyszerű kérdéshez nem kötelező gomb');
    expect(result).toContain('a felhasználó által kért, konkrét tervhez');
    expect(result).not.toContain('## The Plan');
    expect(result).not.toContain('Implement this plan');
    expect(result).not.toContain('ALWAYS include at least one action');
  });
});
