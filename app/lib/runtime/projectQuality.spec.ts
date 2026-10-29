import { describe, it, expect } from 'vitest';
import { projectQualityReport } from './projectQuality';

const file = (content: string) => ({ type: 'file', content, isBinary: false });
describe('project quality report', () => {
  it('reports real scripts without claiming that builds or visual checks ran', async () => {
    const result = await projectQualityReport({
      '/home/project/src/App.tsx': file('export default function App(){ return <button>Start</button>; }'),
      '/home/project/package.json': file(
        JSON.stringify({ scripts: { build: 'vite build', typecheck: 'tsc --noEmit' } }),
      ),
      '/home/project/.muhely/design.json': file('{}'),
    });
    expect(result.isError).toBe(false);
    expect(result.checks.map((check) => check.command)).toEqual(['npm run build', 'npm run typecheck']);
    expect(result).toMatchObject({ buildChecked: false, runtimeChecked: false, visualChecked: false });
  });
  it('detects broken JSX and a malformed package manifest, ignoring generated dependencies', async () => {
    const result = await projectQualityReport({
      'src/App.tsx': file('export default function App() { return <button>Broken; }'),
      'package.json': file('{broken'),
      'node_modules/dependency/index.js': file('bad syntax }}}'),
    });
    expect(result.isError).toBe(true);
    expect(result.checkedSourceFiles).toBe(1);
    expect(result.issues.filter((issue) => issue.severity === 'error')).toHaveLength(2);
  });
  it('never reports an empty project as checked successfully', async () => {
    const result = await projectQualityReport({});
    expect(result.isError).toBe(true);
    expect(result.checks).toEqual([]);
  });
});
