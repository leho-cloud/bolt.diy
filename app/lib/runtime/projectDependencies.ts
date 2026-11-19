interface DependencyRuntime {
  fs: { readdir(path: string): Promise<unknown[]> };
  spawn(
    command: string,
    args: string[],
    options?: { env?: Record<string, string> },
  ): Promise<{
    output: ReadableStream<string>;
    exit: Promise<number>;
    kill(): void;
  }>;
}

/** Commands act on the existing project; install its declared packages before using local tools. */
export async function ensureProjectDependencies(
  runtime: DependencyRuntime,
  command: string,
  manifest: string | undefined,
  write: (text: string) => void,
  signal?: AbortSignal,
) {
  if (!manifest || !/^(?:npm\s+(?:run|exec)|npx\s+|pnpm\s+|yarn\s+|bun\s+run)/.test(command.trim())) {
    return;
  }

  const pkg = JSON.parse(manifest);
  const required = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

  if (!required.length) {
    return;
  }

  try {
    const installed = new Set(await runtime.fs.readdir('node_modules'));

    if (required.every((name) => installed.has(name.split('/')[0]))) {
      return;
    }
  } catch {
    /* fresh or restored project */
  }
  signal?.throwIfAborted();
  write('\r\nA projekt csomagjainak telepítése…\r\n');

  const install = await runtime.spawn('/bin/jsh', ['-c', 'npm install --include=dev --no-audit --no-fund'], {
    env: { CI: 'true', npm_config_yes: 'false' },
  });

  const stop = () => install.kill();
  signal?.addEventListener('abort', stop, { once: true });

  const timer = setTimeout(stop, 120_000);

  try {
    if (signal?.aborted) {
      stop();
    }

    const output = install.output.pipeTo(
      new WritableStream<string>({
        write(chunk) {
          write(chunk);
        },
      }),
    );

    const code = await install.exit;
    await output;
    signal?.throwIfAborted();

    if (code !== 0) {
      throw new Error(
        `A projekt csomagjainak telepítése nem sikerült (kilépési kód: ${code}). Az indítás nem történt meg.`,
      );
    }

    write('\r\nA projekt csomagjai telepítve.\r\n');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}
