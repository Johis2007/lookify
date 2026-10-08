import { Link, router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { PRO_CLAUSE, TermsAccordion } from '@/components/TermsAccordion';
import { ensureMediaLibraryPermission } from '@/lib/permissions';

const DOC_TYPES = ['Certificado técnico', 'Licencia', 'Diploma', 'Registro sanitario', 'Otro'];

// Documento obligatorio: sin archivo válido no se puede enviar la solicitud.
// Límite 10 MB (Directus Files rechaza archivos gigantes y rompe el registro).
const MAX_DOC_BYTES = 10 * 1024 * 1024;

type Doc = { uri: string; name: string; mimeType: string; kind: 'image' | 'pdf'; size?: number };

// FLUJO PROFESIONAL (4 pasos): 1 cuenta · 2 perfil (especialidad, años,
// teléfono) · 3 verificación (documento PDF/imagen con vista previa +
// aceptación de pendiente + términos) · 4 confirmación (pending, sin solicitudes).
export default function RegisterPro() {
  const { registerProfessional } = useAuth();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [specialties, setSpecialties] = useState('');
  const [years, setYears] = useState('');
  const [phone, setPhone] = useState('');
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [acceptPending, setAcceptPending] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const validAccount =
    name.trim().length >= 2 && /.+@.+\..+/.test(email.trim()) && password.length >= 8;
  const yearsNum = Math.max(0, Math.min(60, parseInt(years, 10) || 0));
  const validProfile = specialties.trim().length >= 3 && phone.trim().length >= 7;
  const validDocs = doc !== null && acceptPending && terms;

  const pickImage = async () => {
    setError(null);
    if (!(await ensureMediaLibraryPermission())) {
      setError('Permiso de galería denegado.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (a.fileSize != null && a.fileSize > MAX_DOC_BYTES) {
      setError('La imagen supera 10 MB. Elige una más liviana o un PDF.');
      return;
    }
    setDoc({
      uri: a.uri,
      name: a.fileName || `documento-${Date.now()}.jpg`,
      mimeType: a.mimeType || 'image/jpeg',
      kind: 'image',
      size: a.fileSize,
    });
  };

  const pickPdf = async () => {
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      if (a.size != null && a.size > MAX_DOC_BYTES) {
        setError('El PDF supera 10 MB. Comprímelo e inténtalo de nuevo.');
        return;
      }
      setDoc({ uri: a.uri, name: a.name || `documento-${Date.now()}.pdf`, mimeType: a.mimeType || 'application/pdf', kind: 'pdf', size: a.size });
    } catch {
      setError('No se pudo leer el PDF.');
    }
  };

  const submit = async () => {
    if (!doc || !acceptPending || !terms) return;
    setError(null);
    setBusy(true);
    try {
      await registerProfessional({
        email: email.trim(),
        password,
        displayName: name.trim(),
        specialties: specialties.trim(),
        yearsExp: yearsNum,
        phone: phone.trim(),
        docType,
        doc: { uri: doc.uri, name: doc.name, mimeType: doc.mimeType },
      });
      setStep(4);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo enviar la verificación.');
    } finally {
      setBusy(false);
    }
  };

  const kb = (n?: number) => (n == null ? '' : ` · ${Math.max(1, Math.round(n / 1024))} KB`);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.wrap}>
      <Pressable onPress={() => (step === 1 ? router.back() : setStep(step - 1))} style={styles.backRow}>
        <Text style={styles.back}>← {step === 1 ? 'Elegir rol' : 'Atrás'}</Text>
        <Text style={styles.steps}>Paso {step} de 4</Text>
      </Pressable>
      <Text style={styles.h1}>Cuenta profesional</Text>
      <View style={styles.dots}>
        {[1, 2, 3, 4].map((d) => (
          <View key={d} style={[styles.dot, d <= step && styles.dotOn]} />
        ))}
      </View>

      {step === 1 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👤 Tus datos</Text>
          <Text style={styles.label}>Nombre completo</Text>
          <View style={styles.field}>
            <TextInput style={styles.input} placeholder="Ej. Laura Rodríguez" value={name} onChangeText={setName} placeholderTextColor="#75777e" />
          </View>
          <Text style={styles.label}>Correo electrónico</Text>
          <View style={styles.field}>
            <TextInput style={styles.input} placeholder="nombre@correo.com" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholderTextColor="#75777e" />
          </View>
          <Text style={styles.label}>Contraseña (mínimo 8 caracteres)</Text>
          <View style={styles.field}>
            <TextInput style={styles.input} placeholder="••••••••" secureTextEntry={!showPw} value={password} onChangeText={setPassword} placeholderTextColor="#75777e" />
            <Pressable onPress={() => setShowPw(!showPw)}>
              <Text style={styles.eye}>{showPw ? '🙈' : '👁️'}</Text>
            </Pressable>
          </View>
          <Pressable style={[styles.btn, !validAccount && styles.btnOff]} onPress={() => validAccount && setStep(2)} disabled={!validAccount}>
            <Text style={styles.btnT}>Continuar →</Text>
          </Pressable>
        </View>
      )}

      {step === 2 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>✂️ Tu perfil profesional</Text>
          <Text style={styles.label}>Especialidad(es)</Text>
          <View style={styles.field}>
            <TextInput style={styles.input} placeholder="Ej. Balayage, colorimetría, barbería" value={specialties} onChangeText={setSpecialties} placeholderTextColor="#75777e" />
          </View>
          <Text style={styles.label}>Años de experiencia</Text>
          <View style={styles.field}>
            <TextInput style={styles.input} placeholder="Ej. 5" value={years} onChangeText={(t) => setYears(t.replace(/[^0-9]/g, ''))} keyboardType="numeric" placeholderTextColor="#75777e" />
          </View>
          <Text style={styles.label}>Teléfono móvil</Text>
          <View style={styles.field}>
            <Text style={styles.prefix}>🇨🇴 +57</Text>
            <TextInput style={styles.input} placeholder="300 123 4567" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor="#75777e" />
          </View>
          <Pressable style={[styles.btn, !validProfile && styles.btnOff]} onPress={() => validProfile && setStep(3)} disabled={!validProfile}>
            <Text style={styles.btnT}>Continuar →</Text>
          </Pressable>
        </View>
      )}

      {step === 3 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🛡 Verificación de requisitos</Text>
          <Text style={styles.sub}>
            El documento es <Text style={{ fontWeight: '800' }}>obligatorio</Text>: acredita tu idoneidad
            (certificado, licencia, diploma o registro sanitario, máx. 10 MB). Sin él no se crea la cuenta.
          </Text>
          <Text style={styles.label}>Tipo de documento</Text>
          <View style={styles.chips}>
            {DOC_TYPES.map((t) => (
              <Pressable key={t} onPress={() => setDocType(t)} style={[styles.chip, docType === t && styles.chipOn]}>
                <Text style={[styles.chipT, docType === t && styles.chipTOn]}>{t}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.pickRow}>
            <Pressable style={styles.pickBtn} onPress={pickImage}>
              <Text style={styles.pickT}>🖼️ Foto / imagen</Text>
            </Pressable>
            <Pressable style={styles.pickBtn} onPress={pickPdf}>
              <Text style={styles.pickT}>📄 Archivo PDF</Text>
            </Pressable>
          </View>
          {doc ? (
            <View style={styles.preview}>
              {doc.kind === 'image' ? (
                <Image source={{ uri: doc.uri }} style={styles.previewImg} />
              ) : (
                <Text style={styles.pdfIcon}>📄</Text>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
                <Text style={styles.sub}>{docType}{kb(doc.size)}</Text>
              </View>
              <Pressable onPress={() => setDoc(null)}>
                <Text style={styles.docX}>✕</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.hint}>⚠️ Documento obligatorio: elige foto o PDF para continuar.</Text>
          )}
          <Pressable style={styles.check} onPress={() => setAcceptPending(!acceptPending)}>
            <View style={[styles.box, acceptPending && styles.boxOn]}>
              {acceptPending && <Text style={styles.boxT}>✓</Text>}
            </View>
            <Text style={styles.checkT}>Acepto que mi cuenta queda en estado pendiente hasta que un administrador revise mi documento.</Text>
          </Pressable>
          <TermsAccordion extra={PRO_CLAUSE} />
          <Pressable style={styles.check} onPress={() => setTerms(!terms)}>
            <View style={[styles.box, terms && styles.boxOn]}>
              {terms && <Text style={styles.boxT}>✓</Text>}
            </View>
            <Text style={styles.checkT}>Acepto los términos y condiciones</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.btn, (!validDocs || busy) && styles.btnOff]} onPress={submit} disabled={!validDocs || busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnT}>Enviar verificación →</Text>}
          </Pressable>
        </View>
      )}

      {step === 4 && (
        <View style={styles.card}>
          <Text style={styles.done}>⏳</Text>
          <Text style={styles.cardTitle}>¡Solicitud recibida!</Text>
          <Text style={styles.sub}>
            Tu cuenta quedó en estado pendiente y entraste a la lista de espera. No podrás recibir solicitudes
            hasta que un administrador revise tu documento desde el panel de verificación. Te avisaremos al aprobarla.
          </Text>
          <Pressable style={styles.btn} onPress={() => router.replace('/pro/incoming')}>
            <Text style={styles.btnT}>Ver mi puesto en la cola →</Text>
          </Pressable>
        </View>
      )}

      <Link href="/(auth)/login" asChild>
        <Pressable style={styles.link}>
          <Text style={styles.linkSub}>
            ¿Ya tienes cuenta? <Text style={styles.linkT}>Iniciar sesión</Text>
          </Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Stitch.colors.surface },
  wrap: { padding: 20, paddingBottom: 40, gap: 10, maxWidth: 520, width: '100%', alignSelf: 'center' },
  backRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
  steps: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurfaceVariant },
  h1: { fontSize: 24, fontWeight: '800', color: Stitch.colors.onSurface },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 28, height: 6, borderRadius: 3, backgroundColor: Stitch.colors.surfaceHigh },
  dotOn: { backgroundColor: Stitch.colors.secondaryContainer },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh },
  cardTitle: { fontSize: 17, fontWeight: '800', color: Stitch.colors.onSurface },
  sub: { fontSize: 13, color: Stitch.colors.onSurfaceVariant, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurfaceVariant, marginTop: 6 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, paddingHorizontal: 12, height: 50 },
  input: { flex: 1, fontSize: 15, color: Stitch.colors.onSurface },
  prefix: { fontSize: 13, fontWeight: '700', color: Stitch.colors.onSurface },
  eye: { fontSize: 16, padding: 6 },
  btn: { backgroundColor: Stitch.colors.primaryContainer, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 10 },
  btnOff: { opacity: 0.45 },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: Stitch.colors.surfaceLow },
  chipOn: { backgroundColor: Stitch.colors.primaryContainer },
  chipT: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurface },
  chipTOn: { color: '#fff' },
  pickRow: { flexDirection: 'row', gap: 8 },
  pickBtn: { flex: 1, borderRadius: 12, padding: 13, alignItems: 'center', backgroundColor: Stitch.colors.surfaceContainer },
  pickT: { fontWeight: '800', fontSize: 13, color: Stitch.colors.onSurface },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, padding: 10 },
  previewImg: { width: 64, height: 64, borderRadius: 10 },
  pdfIcon: { fontSize: 40 },
  docName: { fontSize: 13, fontWeight: '800', color: Stitch.colors.onSurface },
  docX: { fontSize: 16, fontWeight: '900', color: Stitch.colors.error, padding: 6 },
  hint: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, textAlign: 'center' },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 6 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: Stitch.colors.outline, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: Stitch.colors.secondaryContainer, borderColor: Stitch.colors.secondaryContainer },
  boxT: { fontSize: 14, fontWeight: '900', color: Stitch.colors.primaryContainer },
  checkT: { fontSize: 13, fontWeight: '600', color: Stitch.colors.onSurface, flex: 1, lineHeight: 18 },
  error: { color: Stitch.colors.error, textAlign: 'center', fontSize: 13, fontWeight: '600' },
  done: { fontSize: 52, textAlign: 'center' },
  link: { alignItems: 'center', padding: 10 },
  linkSub: { fontSize: 14, color: Stitch.colors.onSurfaceVariant },
  linkT: { color: Stitch.colors.secondary, fontWeight: '800', textDecorationLine: 'underline' },
});
