import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';
import { useAuth } from '@/lib/auth';
import { TermsAccordion } from '@/components/TermsAccordion';

type TipoDoc = 'CC' | 'Pasaporte';
type FieldKey =
  | 'nombre'
  | 'numeroDocumento'
  | 'nacionalidad'
  | 'fecha'
  | 'telefono'
  | 'email'
  | 'password'
  | 'confirm';

// Validadores locales (paridad con el diseño mock; mensajes ES-CO).
function validarNombre(v: string): string | null {
  return v.trim().length >= 2 ? null : 'Ingresa tu nombre completo';
}
function validarDocumento(tipo: TipoDoc, v: string): string | null {
  const t = v.trim();
  if (tipo === 'CC') return /^\d{6,10}$/.test(t) ? null : 'C.C. debe tener de 6 a 10 dígitos';
  return /^[A-Za-z0-9]{6,12}$/.test(t) ? null : 'Pasaporte de 6 a 12 caracteres';
}
function validarNacionalidad(v: string): string | null {
  return v.trim().length >= 3 ? null : 'Ingresa tu nacionalidad';
}
function validarFecha(v: string): string | null {
  const t = v.trim();
  if (!t) return 'Selecciona tu fecha de nacimiento';
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return 'Usa el formato DD/MM/AAAA';
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return 'Fecha no válida';
  }
  if (date > new Date()) return 'La fecha no puede ser futura';
  const age =
    new Date().getFullYear() -
    y -
    (new Date().getMonth() + 1 < mo || (new Date().getMonth() + 1 === mo && new Date().getDate() < d) ? 1 : 0);
  return age >= 18 ? null : 'Debes ser mayor de 18 años';
}
function validarTelefono(v: string): string | null {
  return /^3\d{9}$/.test(v.trim()) ? null : 'Celular de 10 dígitos que inicie en 3';
}
function validarCorreo(v: string): string | null {
  return /.+@.+\..+/.test(v.trim()) ? null : 'Ingresa un correo válido';
}
function validarPassword(v: string): string | null {
  return v.length >= 8 ? null : 'Mínimo 8 caracteres';
}

// FLUJO CLIENTE (3 pasos, rediseño mock: header navy + hoja blanca redondeada):
// 1 cuenta (datos extendidos) · 2 términos (acordeón, botón bloqueado hasta
// aceptar) · 3 confirmación → onboarding. Lógica Directus intacta; documento,
// nacionalidad y fecha son solo UI hasta que el backend agregue columnas
// (teléfono sí se guarda en client_profiles).
export default function RegisterClient() {
  const { registerClient } = useAuth();
  const [step, setStep] = useState(1);
  const [tipoDoc, setTipoDoc] = useState<TipoDoc>('CC');
  const [form, setForm] = useState({
    nombre: '',
    numeroDocumento: '',
    nacionalidad: '',
    fecha: '',
    telefono: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [showPw, setShowPw] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    nombre: false,
    numeroDocumento: false,
    nacionalidad: false,
    fecha: false,
    telefono: false,
    email: false,
    password: false,
    confirm: false,
  });

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));
  const touch = (k: FieldKey) => setTouched((p) => ({ ...p, [k]: true }));

  const errors = useMemo(
    () => ({
      nombre: validarNombre(form.nombre),
      numeroDocumento: validarDocumento(tipoDoc, form.numeroDocumento),
      nacionalidad: validarNacionalidad(form.nacionalidad),
      fecha: validarFecha(form.fecha),
      telefono: validarTelefono(form.telefono),
      email: validarCorreo(form.email),
      password: validarPassword(form.password),
      confirm:
        form.confirm === form.password && form.confirm.length > 0
          ? null
          : 'Las contraseñas no coinciden',
    }),
    [form, tipoDoc]
  );

  const validAccount = Object.values(errors).every((e) => e === null);
  const showErr = (k: FieldKey) => (touched[k] ? errors[k] : null);

  const submit = async () => {
    if (!terms) return;
    setError(null);
    setBusy(true);
    try {
      await registerClient(
        form.email.trim(),
        form.password,
        form.nombre.trim(),
        form.telefono.trim()
      );
      setStep(3);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo crear la cuenta.');
    } finally {
      setBusy(false);
    }
  };

  const firstName = form.nombre.trim().split(' ')[0] || 'Lookify Lover';

  return (
    <View style={styles.container}>
      {/* Header navy centrado (estilo mock) */}
      <View style={styles.header}>
        <Pressable
          onPress={() => (step === 1 ? router.back() : setStep(step - 1))}
          style={styles.backRow}
        >
          <Text style={styles.back}>← {step === 1 ? 'Elegir rol' : 'Atrás'}</Text>
          <Text style={styles.steps}>Paso {step} de 3</Text>
        </Pressable>
        <Text style={styles.title}>Crear cuenta de cliente</Text>
        <Text style={styles.subtitle}>Completa tus datos para continuar</Text>
        <View style={styles.dots}>
          {[1, 2, 3].map((d) => (
            <View key={d} style={[styles.dot, d <= step && styles.dotOn]} />
          ))}
        </View>
      </View>

      {/* Hoja blanca redondeada (estilo mock) */}
      <View style={styles.body}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 1 && (
            <>
              <Field
                label="Nombre completo"
                placeholder="Tu nombre"
                value={form.nombre}
                onChange={set('nombre')}
                onBlur={() => touch('nombre')}
                error={showErr('nombre')}
              />

              <Text style={styles.fieldLabel}>Documento de identidad</Text>
              <View style={styles.chipsRow}>
                {(['CC', 'Pasaporte'] as const).map((t) => {
                  const active = tipoDoc === t;
                  return (
                    <Pressable
                      key={t}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setTipoDoc(t)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {t === 'CC' ? 'C.C.' : 'Pasaporte'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Field
                label="Número de documento"
                placeholder={tipoDoc === 'CC' ? '1234567890' : 'AB123456'}
                value={form.numeroDocumento}
                onChange={set('numeroDocumento')}
                onBlur={() => touch('numeroDocumento')}
                error={showErr('numeroDocumento')}
                keyboardType={tipoDoc === 'CC' ? 'number-pad' : 'default'}
              />

              <Field
                label="Nacionalidad"
                placeholder="Ej. Colombiana"
                value={form.nacionalidad}
                onChange={set('nacionalidad')}
                onBlur={() => touch('nacionalidad')}
                error={showErr('nacionalidad')}
              />

              <Field
                label="Fecha de nacimiento"
                placeholder="DD/MM/AAAA"
                value={form.fecha}
                onChange={set('fecha')}
                onBlur={() => touch('fecha')}
                error={showErr('fecha')}
                keyboardType="number-pad"
              />

              <Field
                label="Teléfono"
                placeholder="3000000000"
                value={form.telefono}
                onChange={set('telefono')}
                onBlur={() => touch('telefono')}
                error={showErr('telefono')}
                keyboardType="phone-pad"
              />
              <Field
                label="Correo electrónico"
                placeholder="nombre@correo.com"
                value={form.email}
                onChange={set('email')}
                onBlur={() => touch('email')}
                error={showErr('email')}
                keyboardType="email-address"
              />
              <Field
                label="Contraseña (mínimo 8 caracteres)"
                placeholder="••••••••"
                value={form.password}
                onChange={set('password')}
                onBlur={() => touch('password')}
                error={showErr('password')}
                secure={!showPw}
                trailing={
                  <Pressable onPress={() => setShowPw(!showPw)}>
                    <Text style={styles.eye}>{showPw ? '🙈' : '👁️'}</Text>
                  </Pressable>
                }
              />
              <Field
                label="Confirmar contraseña"
                placeholder="••••••••"
                value={form.confirm}
                onChange={set('confirm')}
                onBlur={() => touch('confirm')}
                error={showErr('confirm')}
                secure={!showPw}
              />
            </>
          )}

          {step === 2 && (
            <View style={styles.termsCard}>
              <Text style={styles.cardTitle}>📜 Términos y condiciones</Text>
              <Text style={styles.sub}>Lee el texto completo aquí mismo antes de aceptar.</Text>
              <TermsAccordion />
              <Pressable style={styles.termsRow} onPress={() => setTerms(!terms)}>
                <View style={[styles.box, terms && styles.boxOn]}>
                  {terms && <Text style={styles.boxT}>✓</Text>}
                </View>
                <Text style={styles.termsT}>
                  Acepto los Términos y Condiciones y la Política de tratamiento de datos personales
                  de Lookify
                </Text>
              </Pressable>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {!terms && <Text style={styles.hint}>Marca la casilla para activar el botón.</Text>}
            </View>
          )}

          {step === 3 && (
            <View style={styles.doneCard}>
              <Text style={styles.done}>🎉</Text>
              <Text style={styles.cardTitle}>¡Cuenta lista, {firstName}!</Text>
              <Text style={styles.sub}>
                Tu cuenta de cliente quedó creada. Explora el mapa, el radar y reserva tu primer
                servicio.
              </Text>
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

        {/* Footer fijo con borde superior (estilo mock) */}
        <View style={styles.footer}>
          {step === 1 && (
            <Pressable
              style={[styles.btn, !validAccount && styles.btnOff]}
              onPress={() => validAccount && setStep(2)}
              disabled={!validAccount}
            >
              <Text style={styles.btnT}>Continuar →</Text>
            </Pressable>
          )}
          {step === 2 && (
            <Pressable
              style={[styles.btn, (!terms || busy) && styles.btnOff]}
              onPress={submit}
              disabled={!terms || busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnT}>Crear cuenta</Text>
              )}
            </Pressable>
          )}
          {step === 3 && (
            <Pressable style={styles.btn} onPress={() => router.replace('/(auth)/onboarding')}>
              <Text style={styles.btnT}>Explorar Lookify →</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function Field(props: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  error: string | null;
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'phone-pad';
  secure?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <View style={[styles.field, props.error && styles.fieldError]}>
        <TextInput
          style={styles.input}
          placeholder={props.placeholder}
          value={props.value}
          onChangeText={props.onChange}
          onBlur={props.onBlur}
          keyboardType={props.keyboardType ?? 'default'}
          secureTextEntry={props.secure}
          autoCapitalize={props.keyboardType === 'email-address' ? 'none' : 'sentences'}
          placeholderTextColor="#75777e"
        />
        {props.trailing}
      </View>
      {props.error ? <Text style={styles.fieldErrorText}>{props.error}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Stitch.colors.primaryContainer },
  header: {
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  backRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  back: { fontWeight: '700', color: '#FFE9C2' },
  steps: { fontSize: 12, fontWeight: '700', color: '#FFE9C2', opacity: 0.8 },
  title: { fontSize: 18, fontWeight: '600', color: '#fff' },
  subtitle: { fontSize: 13, color: '#FFE9C2', opacity: 0.75, marginTop: 4, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 6, marginTop: 10 },
  dot: { width: 28, height: 6, borderRadius: 3, backgroundColor: '#ffffff33' },
  dotOn: { backgroundColor: Stitch.colors.secondaryContainer },
  body: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Stitch.colors.onSurfaceVariant, marginBottom: 6, marginTop: 8 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Stitch.colors.surfaceLow,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 50,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  fieldError: { borderColor: Stitch.colors.error, backgroundColor: '#fff' },
  input: { flex: 1, fontSize: 15, color: Stitch.colors.onSurface },
  eye: { fontSize: 16, padding: 6 },
  fieldErrorText: { fontSize: 12, color: Stitch.colors.error, marginTop: 4, marginBottom: 4 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    borderWidth: 1,
    borderColor: Stitch.colors.outlineVariant,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chipActive: { backgroundColor: Stitch.colors.primaryContainer, borderColor: Stitch.colors.primaryContainer },
  chipText: { fontSize: 12, color: Stitch.colors.onSurfaceVariant },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  termsCard: { gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: Stitch.colors.onSurface },
  sub: { fontSize: 13, color: Stitch.colors.onSurfaceVariant, lineHeight: 18 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Stitch.colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  boxOn: { backgroundColor: Stitch.colors.primaryContainer, borderColor: Stitch.colors.primaryContainer },
  boxT: { fontSize: 14, fontWeight: '900', color: '#fff' },
  termsT: { fontSize: 12, fontWeight: '600', color: Stitch.colors.onSurface, flex: 1, lineHeight: 18 },
  hint: { fontSize: 12, color: Stitch.colors.onSurfaceVariant, textAlign: 'center' },
  error: { color: Stitch.colors.error, textAlign: 'center', fontSize: 13, fontWeight: '600' },
  doneCard: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  done: { fontSize: 52, textAlign: 'center' },
  link: { alignItems: 'center', padding: 10 },
  linkSub: { fontSize: 14, color: Stitch.colors.onSurfaceVariant },
  linkT: { color: Stitch.colors.secondary, fontWeight: '800', textDecorationLine: 'underline' },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: Stitch.colors.surfaceHigh,
    backgroundColor: '#fff',
  },
  btn: {
    backgroundColor: Stitch.colors.primaryContainer,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  btnOff: { opacity: 0.45 },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
