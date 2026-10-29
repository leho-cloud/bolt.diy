import { assertValidProjectSource } from './projectFileValidation';

interface Entry {
  type: string;
  content?: string;
  isBinary?: boolean;
}

export async function projectQualityReport(input: Record<string, Entry | undefined>) {
  const files = Object.fromEntries(
    Object.entries(input)
      .filter(
        ([path, entry]) =>
          entry?.type === 'file' &&
          !entry.isBinary &&
          typeof entry.content === 'string' &&
          !/(?:^|\/)(?:node_modules|\.git|dist|build)\//.test(path),
      )
      .map(([path, entry]) => [path.replace(/^\/home\/project\//, ''), entry!.content!]),
  );

  const issues: Array<{ file: string; severity: 'error' | 'suggestion'; message: string }> = [];

  let checkedSourceFiles = 0;

  for (const [file, content] of Object.entries(files)) {
    if (!/\.(?:[cm]?[jt]s|[jt]sx|css|html)$/i.test(file) || file.endsWith('.d.ts')) {
      continue;
    }

    if (++checkedSourceFiles > 150) {
      throw new Error('Az ellenőrzés legfeljebb 150 forrásfájlt kezel.');
    }

    if (content.length > 256_000) {
      throw new Error(`Túl nagy forrásfájl: ${file}`);
    }

    try {
      await assertValidProjectSource(file, content);
    } catch (error) {
      issues.push({ file, severity: 'error', message: error instanceof Error ? error.message : 'Hibás szintaxis.' });
    }

    if (/\.(?:jsx|tsx|html)$/i.test(file) && /<img\b(?![^>]*\balt\s*=)[^>]*>/i.test(content)) {
      issues.push({
        file,
        severity: 'suggestion',
        message: 'Van kép alt attribútum nélkül. Ellenőrizd, hogy tartalmi vagy dekoratív kép-e.',
      });
    }
  }

  let manifest: { scripts?: Record<string, string> } = {};

  if (files['package.json']) {
    try {
      manifest = JSON.parse(files['package.json']);
    } catch {
      issues.push({ file: 'package.json', severity: 'error', message: 'A package.json nem érvényes JSON.' });
    }
  }

  const checks = ['build', 'typecheck', 'type-check', 'lint']
    .filter((name) => typeof manifest.scripts?.[name] === 'string' && manifest.scripts[name].trim())
    .map((name) => ({ name, command: `npm run ${name}`, purpose: 'test' as const }));

  if (!checks.length) {
    issues.push({
      file: 'package.json',
      severity: 'suggestion',
      message: 'Nincs build/typecheck/lint parancs. A szintaxisellenőrzés önmagában nem igazolja a működést.',
    });
  }

  if (!files['.muhely/design.json']) {
    issues.push({
      file: '.muhely/design.json',
      severity: 'suggestion',
      message:
        'Nincs mentett közös arculat. Az oldalak és későbbi módosítások egységességéhez rögzítsd a választott vizuális rendszert.',
    });
  }

  if (!checkedSourceFiles) {
    issues.push({ file: '.', severity: 'error', message: 'Nincs ellenőrizhető webes forrásfájl.' });
  }

  return {
    checked: true,
    isError: issues.some((issue) => issue.severity === 'error'),
    checkedSourceFiles,
    issues,
    checks,
    buildChecked: false,
    runtimeChecked: false,
    visualChecked: false,
    next: 'Run the listed real checks after the latest edits. Then inspect the running desktop/mobile preview. This report does not prove either passed.',
  };
}
