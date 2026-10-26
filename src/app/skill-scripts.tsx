import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { router } from 'expo-router';

import { Banner, Button, Dialog, Icon, ListRow, Note, Screen, SectionTitle, Text, type IconName } from '@/components';
import { device, isDesktop } from '@/lib/device';
import { fileSize, SCRIPT_FILE } from '@/lib/skills';
import { assessSkill, type Assessment } from '@/skill-exec/assess';
import { check } from '@/skill-exec/engine/check';
import { keepOutput, openOutput } from '@/skill-exec/outputs';
import { cancelDownload, downloadRuntime, executor, refreshRuntime, removeRuntime, RUNTIME_BYTES, warmRuntime } from '@/skill-exec/runtime';
import manifest from '@/skill-exec/runtime.json';
import selftests from '@/skill-exec/selftests.json';
import { useSkillRuntime } from '@/skill-exec/store';
import type { SelfTest } from '@/skill-exec/types';
import { useLibrary } from '@/store/library';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

const MB = (n: number) => `${Math.round(n / 1048576)} MB`;
const TESTS = selftests as SelfTest[];

type TestState = { status: 'running' | 'pass' | 'fail' | 'skip'; ms?: number; problems?: string[]; files?: { name: string; uri: string }[]; note?: string };

/** The add-on's parts, in plain words (sizes come from runtime.json). */
const INCLUDED: { title: string; sub: string; icon: IconName; match: (f: (typeof manifest.files)[number]) => boolean }[] = [
  { title: `Python ${manifest.python}`, sub: 'The language most skill scripts are written in', icon: 'tool', match: (f) => f.kind === 'core' },
  { title: 'Word, Excel, PowerPoint and PDF tools', sub: 'python-docx, openpyxl, XlsxWriter, python-pptx, pypdf, pdfplumber, pdfminer.six', icon: 'file', match: (f) => f.kind === 'wheel' },
  { title: 'Data and picture tools', sub: 'pandas, numpy, Pillow, lxml and what they need', icon: 'grid', match: (f) => f.kind === 'pyodide' },
  { title: 'Tools for Node scripts', sub: 'pptxgenjs, docx, pdf-lib', icon: 'slashes', match: (f) => f.kind === 'js' },
];

const WORKS = [
  ['Word, Excel and PowerPoint files', 'python-docx, openpyxl, python-pptx, XlsxWriter, and pptxgenjs or docx for Node scripts'],
  ['PDFs', 'merge, split, rotate and fill (pypdf), read text and tables (pdfplumber, pdfminer.six)'],
  ['Data and charts as tables', 'pandas and numpy'],
  ['Pictures', 'resize, crop and convert with Pillow'],
];
const DOESNT = [
  'Converting to PDF or recalculating formulas with LibreOffice',
  'pandoc, ffmpeg (audio and video) and image tools like ImageMagick',
  'A web browser (screenshots, filling in websites)',
  'Turning PDF pages into pictures',
  'Installing other Python or Node packages',
  'Reaching the internet from a script',
];

export default function SkillScripts() {
  const { colors } = useTheme();
  const settings = useSettings();
  const rt = useSkillRuntime();
  const skills = useLibrary((s) => s.skills);
  const [confirm, setConfirm] = useState(false);
  const [fits, setFits] = useState<{ name: string; a: Assessment }[] | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [testing, setTesting] = useState(false);
  const [startMs, setStartMs] = useState<number | null>(null);
  const where = isDesktop ? 'computer' : 'phone';
  // The user asked to turn it on once the download finishes.
  const wantOn = useRef(false);
  const on = settings.skillScripts && rt.status === 'ready';

  useEffect(() => {
    void refreshRuntime();
  }, []);
  // Turn on once the download the user asked for has finished.
  useEffect(() => {
    if (rt.status === 'ready' && wantOn.current) {
      wantOn.current = false;
      settings.set({ skillScripts: true });
    }
  }, [rt.status, settings]);

  // How many of the user's skills can run here.
  useEffect(() => {
    let alive = true;
    (async () => {
      const lib = useLibrary.getState();
      const out: { name: string; a: Assessment }[] = [];
      for (const s of skills) {
        const list = await lib.skillFiles(s.id);
        const files: { path: string; text: string }[] = [];
        for (const f of list.filter((x) => SCRIPT_FILE.test(x.path) || /\.md$/i.test(x.path)).slice(0, 40)) files.push({ path: f.path, text: (await lib.readSkillFile(s.id, f.path)) ?? '' });
        out.push({ name: s.name, a: assessSkill(s.body, files, where) });
      }
      if (alive) setFits(out);
    })();
    return () => {
      alive = false;
    };
  }, [skills, where]);

  const toggle = (v: boolean) => {
    if (!v) return settings.set({ skillScripts: false });
    if (rt.status === 'ready' && isDesktop) return setConfirm(true);
    if (rt.status === 'ready') return settings.set({ skillScripts: true });
    setConfirm(true);
  };
  const accept = () => {
    setConfirm(false);
    if (isDesktop) return settings.set({ skillScripts: true });
    wantOn.current = true;
    void downloadRuntime();
  };

  const runTests = async () => {
    setTesting(true);
    setTests({});
    try {
      const t0 = Date.now();
      await warmRuntime();
      setStartMs(Date.now() - t0);
    } catch (e: any) {
      setTesting(false);
      return Alert.alert('Python didn’t start', e.message);
    }
    const enc = new TextEncoder();
    for (const t of TESTS) {
      if (isDesktop && t.id === 'network') {
        setTests((s) => ({ ...s, [t.id]: { status: 'skip', note: 'On a computer, scripts run like any program, so they can use the internet.' } }));
        continue;
      }
      setTests((s) => ({ ...s, [t.id]: { status: 'running' } }));
      try {
        const files = Object.fromEntries(Object.entries(t.files).map(([k, v]) => [k, enc.encode(v)]));
        const r = await executor.run({ command: t.command, files, timeoutMs: t.timeoutMs });
        const problems = check(t, r);
        const kept = Object.entries(r.outputFiles)
          .filter(([n]) => (t.expect.outputs ?? []).includes(n))
          .map(([name, bytes]) => ({ name, uri: keepOutput(name, bytes) }));
        setTests((s) => ({ ...s, [t.id]: { status: problems.length ? 'fail' : 'pass', ms: r.durationMs, problems: problems.length ? [...problems, (r.stderr || r.stdout).slice(-400)] : undefined, files: kept } }));
      } catch (e: any) {
        setTests((s) => ({ ...s, [t.id]: { status: 'fail', problems: [e.message] } }));
      }
    }
    setTesting(false);
  };

  const withScripts = fits?.filter((f) => f.a.fit !== 'text') ?? [];
  const full = withScripts.filter((f) => f.a.fit === 'full').length;
  const percent = withScripts.length ? Math.round((full / withScripts.length) * 100) : null;
  const passed = Object.values(tests).filter((t) => t.status === 'pass').length;
  const ran = Object.values(tests).filter((t) => t.status === 'pass' || t.status === 'fail').length;

  return (
    <Screen header={{ title: 'Run skill scripts', sub: isDesktop ? 'With this computer’s Python and Node' : `In a sandbox on this ${device}` }} gap={20}>
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <Icon name="tool" size={20} color={colors.text} />
          <Text size={14} color="text2" style={{ flex: 1, lineHeight: 20.5 }}>
            {isDesktop
              ? 'Some skills come with small programs, for example to make Word, Excel, PowerPoint or PDF files. On a computer they run with your own Python and Node.'
              : 'Some skills come with small programs, for example to make Word, Excel, PowerPoint or PDF files for you. Turn this on to let them run here, in a closed sandbox.'}
          </Text>
        </View>
        {!isDesktop && (rt.status === 'none' || rt.status === 'unknown') ? (
          <View style={{ gap: 12 }}>
            <Text size={12} weight="medium" color="muted" style={{ letterSpacing: 0.4 }}>{`WHAT GETS DOWNLOADED · ${MB(RUNTIME_BYTES)}, ONE TIME`}</Text>
            {INCLUDED.map((g) => (
              <View key={g.title} style={{ flexDirection: 'row', gap: 10 }}>
                <Icon name={g.icon} size={17} color={colors.text2} />
                <View style={{ flex: 1, gap: 1 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Text size={14} style={{ flex: 1 }}>{g.title}</Text>
                    <Text mono size={12} color="muted">{MB(manifest.files.filter(g.match).reduce((n, f) => n + f.size, 0))}</Text>
                  </View>
                  <Text size={12} color="muted" style={{ lineHeight: 17 }}>{g.sub}</Text>
                </View>
              </View>
            ))}
            <View style={{ gap: 6, paddingTop: 2 }}>
              {[`Runs in a closed sandbox on your ${device}: no internet, no access to your photos, contacts or other apps.`, 'Only sees the files you share in the chat, and AI Hat asks before each run.', 'Works offline afterwards. Remove it any time from this page.'].map((line) => (
                <View key={line} style={{ flexDirection: 'row', gap: 8 }}>
                  <Icon name="check" size={14} color={colors.accent} strokeWidth={2} />
                  <Text size={12.5} color="text2" style={{ flex: 1, lineHeight: 18 }}>{line}</Text>
                </View>
              ))}
            </View>
            <View style={{ gap: 4, paddingTop: 2 }}>
              <Button label={`Download · ${MB(RUNTIME_BYTES)}`} height={48} onPress={() => { wantOn.current = true; void downloadRuntime(); }} />
              <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => ({ height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
                <Text size={14.5} color="muted">Not now</Text>
              </Pressable>
            </View>
          </View>
        ) : rt.status === 'downloading' ? null : (
          <View style={{ marginHorizontal: -4 }}>
            <ListRow label="Run skill scripts" sub={on ? 'On' : rt.status === 'ready' && !isDesktop ? `Add-on downloaded (${MB(RUNTIME_BYTES)})` : undefined} toggle={{ on: settings.skillScripts, onChange: toggle }} />
          </View>
        )}
        {rt.status === 'downloading' && (
          <View style={{ gap: 8 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
              <View style={{ width: `${Math.max(2, Math.round((rt.done / Math.max(1, rt.total)) * 100))}%`, height: 6, backgroundColor: colors.accent }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text size={12.5} color="muted" style={{ flex: 1 }}>{`${MB(rt.done)} of ${MB(rt.total)} · checking each file as it arrives`}</Text>
              <Pressable accessibilityRole="button" onPress={() => { wantOn.current = false; cancelDownload(); }} hitSlop={8}>
                <Text size={13} color="accent">Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
        {rt.preparing && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={colors.muted} />
            <Text size={12.5} color="muted">{`Getting the sandbox ready (first time only): ${Math.round((rt.preparing.done / Math.max(1, rt.preparing.total)) * 100)}%`}</Text>
          </View>
        )}
        {rt.status === 'error' && rt.error ? <Banner tone="danger">{rt.error}</Banner> : null}
        {rt.status === 'error' && !isDesktop ? <Button label="Try the download again" variant="outline" height={44} textSize={14} onPress={() => { wantOn.current = true; void downloadRuntime(); }} /> : null}
        {isDesktop && rt.tools ? (
          <Text size={12.5} color={rt.tools.python ? 'muted' : 'warn'} style={{ lineHeight: 18 }}>
            {rt.tools.python ? `Found Python ${rt.tools.python}` : 'Python isn’t installed: Python scripts won’t run. Install it from python.org (on Windows, tick “Add python.exe to PATH”), then restart AI Hat.'}
            {` · ${rt.tools.node ? `Node ${rt.tools.node}` : 'no Node, so Node scripts use the Bun inside AI Hat'}`}
          </Text>
        ) : null}
      </View>

      {settings.skillScripts && (
        <View>
          <ListRow label="Ask before each run" sub={settings.skillScriptsAsk ? 'You see the command and choose Run or Don’t run' : 'Scripts run as soon as the assistant asks'} toggle={{ on: settings.skillScriptsAsk, onChange: (skillScriptsAsk) => settings.set({ skillScriptsAsk }) }} />
        </View>
      )}

      <View style={{ gap: 8 }}>
        <SectionTitle space={0}>{`Your skills on this ${device}`}</SectionTitle>
        {fits === null ? (
          <Text size={13} color="muted" style={{ paddingHorizontal: 4 }}>Checking your skills…</Text>
        ) : !withScripts.length ? (
          <Note>{skills.length ? 'None of your skills come with scripts: they are instructions only and work everywhere.' : 'You have no skills yet. Add some in Skills.'}</Note>
        ) : (
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text size={28} weight="semi">{`${percent}%`}</Text>
              <Text size={13.5} color="text2" style={{ flex: 1 }}>{`of your skills with scripts can run fully here (${full} of ${withScripts.length})`}</Text>
            </View>
            {withScripts.map((f) => (
              <View key={f.name} style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: f.a.fit === 'full' ? colors.accent : 'transparent', borderWidth: f.a.fit === 'full' ? 0 : 1.5, borderColor: colors.warn }} />
                  <Text mono size={13.5} style={{ flex: 1 }} numberOfLines={1}>{f.name}</Text>
                  <Text size={12} color={f.a.fit === 'full' ? 'muted' : 'warn'}>{f.a.fit === 'full' ? 'Runs' : 'Partly'}</Text>
                </View>
                {f.a.reasons.length ? <Text size={12} color="muted" style={{ paddingLeft: 15, lineHeight: 17 }}>{f.a.reasons.join('; ')}</Text> : null}
              </View>
            ))}
            <Text size={12} color="muted" style={{ lineHeight: 17 }}>“Partly” skills still do their other steps; the assistant is told what’s missing and works around it. This is a quick look at each skill, not a promise.</Text>
          </View>
        )}
      </View>

      {!isDesktop && (
        <View style={{ gap: 8 }}>
          <SectionTitle space={0}>What works on a phone</SectionTitle>
          {WORKS.map(([title, sub]) => (
            <View key={title} style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 4 }}>
              <Icon name="check" size={16} color={colors.accent} strokeWidth={2} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text size={14}>{title}</Text>
                <Text size={12} color="muted">{sub}</Text>
              </View>
            </View>
          ))}
          <SectionTitle space={0}>What a phone can’t do</SectionTitle>
          {DOESNT.map((d) => (
            <View key={d} style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 4 }}>
              <Icon name="close" size={16} color={colors.warn} strokeWidth={2} />
              <Text size={14} style={{ flex: 1 }}>{d}</Text>
            </View>
          ))}
          <Note>{`These are limits of phones, not of AI Hat: those programs only exist for computers. Scripts run one at a time, for up to 60 seconds each, and the first run after opening the app waits a few seconds while Python starts (Python ${manifest.python}).`}</Note>
        </View>
      )}

      {on && (
        <View style={{ gap: 8 }}>
          <SectionTitle space={0}>Check that it works</SectionTitle>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' }}>
            <View style={{ padding: 14, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 }}>
                  {testing ? <ActivityIndicator size="small" color={colors.accent} /> : <Icon name={ran && passed === ran ? 'check' : ran ? 'alert' : 'tool'} size={18} color={ran && passed === ran ? colors.accent : ran ? colors.warn : colors.text2} strokeWidth={2} />}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text size={15} weight="medium">{testing ? `Checking… ${ran} of ${TESTS.length}` : ran ? `${passed} of ${ran} passed` : 'Not checked yet'}</Text>
                  <Text size={12.5} color="muted">
                    {startMs != null ? (rt.coldMs ? `Python started in ${(rt.coldMs / 1000).toFixed(1)} s` : 'Python was already running') : 'Makes Word, Excel, PDF and PowerPoint files, stops a runaway script, and checks there’s no internet'}
                  </Text>
                </View>
              </View>
              <Button label={testing ? 'Checking…' : ran ? 'Run the checks again' : 'Run the checks'} variant="outline" height={44} textSize={14} disabled={testing} onPress={runTests} />
            </View>
            {Object.keys(tests).length > 0 &&
              TESTS.map((t) => {
                const s = tests[t.id];
                return (
                  <View key={t.id} style={{ borderTopWidth: 1, borderTopColor: colors.hairline, paddingHorizontal: 14, paddingVertical: 11, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 18, alignItems: 'center' }}>
                        {!s ? (
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border }} />
                        ) : s.status === 'running' ? (
                          <ActivityIndicator size="small" color={colors.muted} />
                        ) : (
                          <Icon name={s.status === 'pass' ? 'check' : s.status === 'skip' ? 'info' : 'close'} size={16} color={s.status === 'pass' ? colors.accent : s.status === 'skip' ? colors.muted : colors.danger} strokeWidth={2.2} />
                        )}
                      </View>
                      <Text size={14} color={s ? 'text' : 'muted'} style={{ flex: 1 }} numberOfLines={1}>{t.title}</Text>
                      {s?.ms != null ? <Text mono size={12} color="muted">{`${(s.ms / 1000).toFixed(1)} s`}</Text> : null}
                    </View>
                    {s?.note ? <Text size={12} color="muted" style={{ paddingLeft: 28 }}>{s.note}</Text> : null}
                    {s?.problems ? <Text size={12} color="danger" selectable style={{ paddingLeft: 28, lineHeight: 17 }}>{s.problems.join('\n')}</Text> : null}
                    {s?.files?.length ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 28 }}>
                        {s.files.map((f) => (
                          <Pressable key={f.name} accessibilityRole="button" accessibilityLabel={`Open ${f.name}`} onPress={() => openOutput(f.uri, f.name).catch((e) => Alert.alert('Couldn’t open it', e.message))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.surface2, opacity: pressed ? 0.6 : 1 })}>
                            <Icon name="file" size={13} color={colors.accent} />
                            <Text size={12.5} color="accent">{f.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
          </View>
        </View>
      )}

      {!isDesktop && (rt.status === 'ready' || rt.status === 'error') && (
        <View style={{ gap: 6 }}>
          <Button
            label="Remove the add-on"
            variant="danger"
            height={44}
            textSize={14}
            onPress={() =>
              Alert.alert('Remove the add-on?', `This frees ${MB(RUNTIME_BYTES)} and turns skill scripts off. You can download it again any time.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => void removeRuntime() },
              ])
            }
          />
        </View>
      )}

      <Dialog
        visible={confirm}
        onClose={() => setConfirm(false)}
        title={isDesktop ? 'Let skills run on this computer?' : 'Let skills run their tools?'}
        confirmLabel={isDesktop ? 'Turn on' : `Download (${MB(RUNTIME_BYTES)})`}
        onConfirm={accept}>
        <View style={{ gap: 10 }}>
          {(isDesktop
            ? [
                'Skills’ scripts run with your own Python and Node, in a temporary folder that is deleted afterwards.',
                'They don’t get AI Hat’s keys or settings, but like any program they can use your files and the internet.',
                'AI Hat asks before each run, so you see every command first.',
              ]
            : [
                `AI Hat downloads a one-time add-on (${MB(RUNTIME_BYTES)}) with Python and the tools skills use. After that it works offline.`,
                `It runs in a closed sandbox on your ${device}: no internet, no access to your photos, contacts or other apps.`,
                'It only sees the files you share in the chat, and AI Hat asks before each run.',
                'Some skills need programs phones don’t have; those steps are skipped and you’re told.',
              ]
          ).map((line) => (
            <View key={line} style={{ flexDirection: 'row', gap: 8 }}>
              <Text color="muted">•</Text>
              <Text size={14} color="text2" style={{ flex: 1, lineHeight: 20 }}>{line}</Text>
            </View>
          ))}
          {!isDesktop ? <Text size={12} color="muted">{`Use Wi-Fi if you can. You can remove it any time from this page. Files: Python ${manifest.python} (Pyodide ${manifest.pyodide}) and ${manifest.files.length - 5} packages, checked one by one (${fileSize(RUNTIME_BYTES)}).`}</Text> : null}
        </View>
      </Dialog>
    </Screen>
  );
}
