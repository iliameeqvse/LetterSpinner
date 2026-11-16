import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import { useFonts } from 'expo-font';
import { NotoSansGeorgian_400Regular } from '@expo-google-fonts/noto-sans-georgian/400Regular';
import { NotoSerifGeorgian_400Regular } from '@expo-google-fonts/noto-serif-georgian/400Regular';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { segmentPage, ALIGNMENT_SECONDS } from './src/letter-model';

const defaultApi = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'web'
  ? (window.location.port === '8000' ? window.location.origin : `${window.location.protocol}//${window.location.hostname}:8000`)
  : (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000'));

async function api(base, path, options) {
  const response = await fetch(base.replace(/\/+$/, '') + path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Server error ${response.status}`);
  return data;
}

function Action({ label, onPress, disabled }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

function Letter({ token, phase }) {
  const animated = useAnimatedStyle(() => ({ transform: [{ rotateZ: `${360 * token.turns * phase.value}deg` }] }), [token.turns]);
  return <Animated.Text style={[styles.letter, { fontFamily: token.font }, animated]}>{token.value}</Animated.Text>;
}

function ReaderText({ model, plain, phase }) {
  if (plain || !model.canAnimate) return <Text selectable style={styles.plainText}>{model.text}</Text>;
  const words = [];
  let word = [];
  for (const token of model.tokens) {
    if (/\s/u.test(token.value)) { if (word.length) words.push(word); word = []; }
    else word.push(token);
  }
  if (word.length) words.push(word);
  return <View style={styles.words} accessible accessibilityLabel={model.text}>{words.map((letters, i) =>
    <View key={i} style={styles.word} accessible={false}>{letters.map(token => token.letter
      ? <Letter key={token.index} token={token} phase={phase} />
      : <Text key={token.index} style={styles.letter}>{token.value}</Text>)}</View>)}</View>;
}

export default function App() {
  const [fontsLoaded] = useFonts({ NotoSansGeorgian: NotoSansGeorgian_400Regular, NotoSerifGeorgian: NotoSerifGeorgian_400Regular });
  const [apiUrl, setApiUrl] = useState(defaultApi);
  const [documentInfo, setDocumentInfo] = useState(null);
  const [pageNumber, setPageNumber] = useState(0);
  const [pageText, setPageText] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Choose a PDF to begin.');
  const [paused, setPaused] = useState(false);
  const [plain, setPlain] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [minTurns, setMinTurns] = useState(2);
  const [maxTurns, setMaxTurns] = useState(4);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(true);
  const phase = useSharedValue(0);
  const pagePhases = useRef(new Map());
  const requestId = useRef(0);
  const seed = useRef(Math.floor(Math.random() * 0xffffffff));
  const storedDocument = useRef(null);
  const model = useMemo(() => ({ text: pageText, ...segmentPage(pageText, seed.current, pageNumber || 1, minTurns, maxTurns) }), [pageText, pageNumber, minTurns, maxTurns]);
  const canSpin = !!documentInfo && !!pageText && model.canAnimate && !plain && !paused && !reduceMotion && active && !loading && fontsLoaded;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => setReduceMotion(false));
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const app = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { motion.remove(); app.remove(); };
  }, []);

  useEffect(() => {
    cancelAnimation(phase);
    if (!canSpin) return;
    if (phase.value >= 1) phase.value = 0;
    phase.value = withTiming(1, { duration: (1 - phase.value) * ALIGNMENT_SECONDS * 1000 / speed, easing: Easing.linear }, finished => {
      if (finished) {
        phase.value = 0;
        phase.value = withRepeat(withTiming(1, { duration: ALIGNMENT_SECONDS * 1000 / speed, easing: Easing.linear }), -1, false);
      }
    });
    return () => cancelAnimation(phase);
  }, [canSpin, speed, pageNumber]);

  async function loadPage(info, target, base = apiUrl) {
    const request = ++requestId.current;
    if (pageNumber) pagePhases.current.set(pageNumber, phase.value);
    cancelAnimation(phase);
    setLoading(true);
    setStatus(`Loading page ${target}…`);
    try {
      const data = await api(base, `/api/documents/${info.id}/pages/${target}/`);
      if (request !== requestId.current) return;
      phase.value = pagePhases.current.get(target) || 0;
      setPageNumber(target);
      setPageText(data.text);
      setStatus(data.text ? `Page ${target} of ${info.page_count}` : 'No extractable text on this page.');
    } catch (error) {
      if (request === requestId.current) setStatus(error.message);
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }

  async function choosePdf() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const file = Platform.OS === 'web' ? result.output?.[0] : result.assets[0];
    if (!file) { setStatus('Could not read the selected PDF.'); return; }
    if (file.size && file.size > 25 * 1024 * 1024) { setStatus('PDFs must be 25 MiB or smaller.'); return; }
    const base = apiUrl.trim();
    if (!/^https?:\/\//i.test(base)) { setStatus('Enter a full server URL.'); return; }
    const request = ++requestId.current;
    setLoading(true);
    setStatus('Uploading PDF…');
    const form = new FormData();
    form.append('file', Platform.OS === 'web' ? file : { uri: file.uri, name: file.name || 'document.pdf', type: 'application/pdf' });
    try {
      const info = await api(base, '/api/documents/', { method: 'POST', body: form });
      if (request !== requestId.current) return;
      if (storedDocument.current) {
        const old = storedDocument.current;
        api(old.base, `/api/documents/${old.id}/`, { method: 'DELETE' }).catch(() => {});
      }
      storedDocument.current = { id: info.id, base };
      seed.current = Math.floor(Math.random() * 0xffffffff);
      pagePhases.current.clear();
      phase.value = 0;
      setDocumentInfo(info);
      setPageNumber(0);
      setPageText('');
      await loadPage(info, 1, base);
    } catch (error) {
      if (request === requestId.current) setStatus(error.message + ' Check the server address and phone network.');
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }

  function closePdf() {
    ++requestId.current;
    cancelAnimation(phase);
    phase.value = 0;
    if (storedDocument.current) {
      const old = storedDocument.current;
      api(old.base, `/api/documents/${old.id}/`, { method: 'DELETE' }).catch(() => {});
    }
    storedDocument.current = null;
    pagePhases.current.clear();
    setDocumentInfo(null);
    setPageNumber(0);
    setPageText('');
    setLoading(false);
    setStatus('Choose a PDF to begin.');
  }

  function changeTurns(nextMin, nextMax) {
    if (nextMin >= nextMax) return;
    cancelAnimation(phase);
    phase.value = 0;
    pagePhases.current.clear();
    setMinTurns(nextMin);
    setMaxTurns(nextMax);
    setStatus('Letter speeds updated. The cycle restarted upright.');
  }

  return <View style={styles.screen}><StatusBar style="dark" /><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>LetterSpinner</Text><Text style={styles.subtitle}>Read a PDF with turning letters.</Text>
    <Text style={styles.label}>Django server address</Text>
    <TextInput accessibilityLabel="Django server address" value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={styles.input} />
    <Text style={styles.hint}>On a phone, enter your computer's LAN IP and port 8000.</Text>
    <View style={styles.row}><Action label="Choose PDF" onPress={choosePdf} disabled={loading} /><Action label="Close PDF" onPress={closePdf} disabled={!documentInfo} /></View>
    {documentInfo && <Text style={styles.fileName}>{documentInfo.name}</Text>}
    <View style={styles.row}><Action label="Previous" onPress={() => loadPage(documentInfo, pageNumber - 1)} disabled={loading || !documentInfo || pageNumber <= 1} /><Text style={styles.pageLabel}>{documentInfo ? `Page ${pageNumber} / ${documentInfo.page_count}` : 'No page'}</Text><Action label="Next" onPress={() => loadPage(documentInfo, pageNumber + 1)} disabled={loading || !documentInfo || pageNumber >= documentInfo.page_count} /></View>
    <View style={styles.row}><Action label={paused ? 'Resume' : 'Pause'} onPress={() => setPaused(!paused)} disabled={!documentInfo || !model.canAnimate || plain || reduceMotion} /><Action label={plain ? 'Spinning text' : 'Normal text'} onPress={() => setPlain(!plain)} disabled={!documentInfo || !model.canAnimate || reduceMotion} /></View>
    <Text style={styles.label}>Overall speed: {speed.toFixed(2)}×</Text>
    <View style={styles.row}><Action label="Slower" onPress={() => setSpeed(Math.max(0.25, Math.round((speed - 0.25) * 100) / 100))} disabled={speed <= 0.25} /><Action label="Faster" onPress={() => setSpeed(Math.min(2, Math.round((speed + 0.25) * 100) / 100))} disabled={speed >= 2} /></View>
    <Text style={styles.label}>Turns per 12 seconds: {minTurns} to {maxTurns}</Text>
    <View style={styles.row}><Action label="Slowest −" onPress={() => changeTurns(Math.max(1, minTurns - 1), maxTurns)} disabled={minTurns <= 1} /><Action label="Slowest +" onPress={() => changeTurns(minTurns + 1, maxTurns)} disabled={minTurns + 1 >= maxTurns} /><Action label="Fastest −" onPress={() => changeTurns(minTurns, maxTurns - 1)} disabled={maxTurns - 1 <= minTurns} /><Action label="Fastest +" onPress={() => changeTurns(minTurns, Math.min(6, maxTurns + 1))} disabled={maxTurns >= 6} /></View>
    <Text accessibilityRole="alert" style={styles.status}>{loading ? 'Loading… ' : ''}{status}</Text>
    <View style={styles.reader}>{pageText ? <ReaderText model={model} plain={plain || reduceMotion || !fontsLoaded} phase={phase} /> : <Text style={styles.empty}>Your document will appear here.</Text>}</View>
    <Text style={styles.hint}>Selectable Latin or Georgian PDFs work best. Pages over 600 animated letters are shown as normal text on mobile.</Text>
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f3ee' },
  content: { width: '100%', maxWidth: 980, alignSelf: 'center', padding: 18, paddingTop: 48, paddingBottom: 70, gap: 11 },
  title: { fontSize: 30, fontWeight: '700', color: '#1e2330' },
  subtitle: { fontSize: 16, color: '#505664', marginBottom: 8 },
  label: { fontWeight: '600', color: '#263248', marginTop: 5 },
  hint: { color: '#5e6674', fontSize: 13 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#a8b2c2', borderRadius: 8, padding: 11, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  button: { backgroundColor: '#e8efff', borderWidth: 1, borderColor: '#9fb4d9', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12 },
  disabled: { opacity: 0.4 }, buttonText: { color: '#173b7a', fontWeight: '600' },
  fileName: { fontWeight: '600', color: '#1e2330' }, pageLabel: { color: '#1e2330' },
  status: { color: '#35425b', minHeight: 22 },
  reader: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#d8dbe1', padding: 18, minHeight: 320 },
  plainText: { fontSize: 22, lineHeight: 37, color: '#1e2330' },
  words: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  word: { flexDirection: 'row', marginRight: 7, marginBottom: 6, alignItems: 'center' },
  letter: { fontSize: 22, lineHeight: 39, color: '#1e2330' }, empty: { color: '#757b86', fontSize: 18 },
});
