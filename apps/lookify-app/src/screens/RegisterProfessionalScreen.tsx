// App Profesional — pantalla 2: Registro (creación de cuenta).

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateField from '../components/DateField';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors, radius, spacing, typography } from '../theme/colors';
import Button from '../components/Button';
import TextField from '../components/TextField';
import BackHeader from '../components/BackHeader';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  registroClienteValido,
  validarConfirmarContrasena,
  validarContrasenaRegistro,
  validarCorreo,
  validarDocumento,
  validarFechaNacimiento,
  validarNacionalidad,
  validarNombre,
  validarTelefono,
  TipoDocumentoId,
} from '../utils/validators';
import { formatDateLocalISO } from '../utils/formatDateLocalISO';
import { getProfessionalRegistrationService } from '../services/professionalRegistrationService';
import { ServiceError } from '../services/errors';
import { TERMS_VERSION } from '../constants/legal/termsMeta';
import { DATA_POLICY_VERSION } from '../constants/legal/dataPolicyMeta';

const TIPOS_DOCUMENTO = [
  { id: 'CC' as const, label: 'C.C.' },
  { id: 'Pasaporte' as const, label: 'Pasaporte' },
] as const;

type FieldKey =
  | 'nombre'
  | 'numeroDocumento'
  | 'nacionalidad'
  | 'telefono'
  | 'email'
  | 'password'
  | 'confirmPassword';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterProfessional'>;

export default function RegisterProfessionalScreen({ navigation }: Props) {
  const [form, setForm] = useState({
    nombre: '',
    numeroDocumento: '',
    nacionalidad: '',
    telefono: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumentoId>('CC');
  const [fechaNacimiento, setFechaNacimiento] = useState<Date | null>(null);
  const [fechaTouched, setFechaTouched] = useState(false);
  const [aceptaLegal, setAceptaLegal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<{
    email?: string;
    numeroDocumento?: string;
  }>({});
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    nombre: false,
    numeroDocumento: false,
    nacionalidad: false,
    telefono: false,
    email: false,
    password: false,
    confirmPassword: false,
  });

  const markTouched = (key: FieldKey) => setTouched((prev) => ({ ...prev, [key]: true }));

  const update = (key: keyof typeof form) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSubmitError(null);
    if (key === 'email' || key === 'numeroDocumento') {
      setServerFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const handleFechaChange = (date: Date | null) => {
    setFechaNacimiento(date);
    setFechaTouched(true);
  };

  const errors = useMemo(() => {
    return {
      nombre: validarNombre(form.nombre),
      numeroDocumento: validarDocumento(tipoDocumento, form.numeroDocumento),
      nacionalidad: validarNacionalidad(form.nacionalidad),
      fecha: validarFechaNacimiento(fechaNacimiento),
      telefono: validarTelefono(form.telefono),
      email: validarCorreo(form.email),
      password: validarContrasenaRegistro(form.password),
      confirmPassword: validarConfirmarContrasena(form.password, form.confirmPassword),
    };
  }, [form, tipoDocumento, fechaNacimiento]);

  const showError = (key: FieldKey, message: string | null) => {
    const server =
      key === 'email'
        ? serverFieldErrors.email
        : key === 'numeroDocumento'
          ? serverFieldErrors.numeroDocumento
          : undefined;
    const msg = server ?? message;
    return touched[key] && msg ? msg : undefined;
  };

  const fechaError = fechaTouched && errors.fecha ? errors.fecha : undefined;

  const formValid = registroClienteValido({
    ...form,
    tipoDocumento,
    fechaNacimiento,
  });

  const handleTipoDocumento = (tipo: TipoDocumentoId) => {
    setTipoDocumento(tipo);
    setServerFieldErrors((prev) => ({ ...prev, numeroDocumento: undefined }));
    if (touched.numeroDocumento) {
      markTouched('numeroDocumento');
    }
  };

  const handleSubmit = async () => {
    if (!aceptaLegal || !formValid || loading || !fechaNacimiento) return;
    setLoading(true);
    setSubmitError(null);
    setServerFieldErrors({});

    const aceptadoEn = new Date().toISOString();

    try {
      const result = await getProfessionalRegistrationService().registrarProfesional({
        nombre: form.nombre,
        tipoDocumento,
        numeroDocumento: form.numeroDocumento,
        nacionalidad: form.nacionalidad,
        fechaNacimiento: formatDateLocalISO(fechaNacimiento),
        telefono: form.telefono,
        email: form.email,
        password: form.password,
        consentimientoTerminos: { version: TERMS_VERSION, aceptadoEn },
        consentimientoPoliticaDatos: { version: DATA_POLICY_VERSION, aceptadoEn },
      });

      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'ProfessionalServiceSelectionPlaceholder',
            params: {
              profesionalId: result.profesionalId,
              solicitudId: result.solicitudId,
              nombre: result.nombre,
              email: result.email,
              estadoSolicitud: result.estadoSolicitud,
              onboardingPaso: result.onboardingPaso,
            },
          },
        ],
      });
    } catch (error) {
      if (error instanceof ServiceError) {
        if (error.code === 'EMAIL_DUPLICATE') {
          setServerFieldErrors({ email: 'Este correo ya está registrado' });
          setTouched((prev) => ({ ...prev, email: true }));
          return;
        }
        if (error.code === 'DOCUMENTO_DUPLICADO') {
          setServerFieldErrors({
            numeroDocumento: 'Este documento ya está registrado',
          });
          setTouched((prev) => ({ ...prev, numeroDocumento: true }));
          return;
        }
        if (error.code === 'NETWORK') {
          setSubmitError('No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.');
          return;
        }
      }
      setSubmitError('No pudimos crear tu cuenta. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackHeader variant="dark" />
        <Image source={require('../../assets/logo-lookify.png')} style={styles.logo} />
        <Text style={styles.title}>Crear cuenta de profesional</Text>
        <Text style={styles.subtitle}>Completa tus datos para continuar</Text>
      </View>

      <View style={styles.body}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TextField
            label="Nombre completo"
            placeholder="Tu nombre"
            value={form.nombre}
            onChangeText={update('nombre')}
            onBlur={() => markTouched('nombre')}
            error={showError('nombre', errors.nombre)}
          />

          <Text style={styles.fieldLabel}>Documento de identidad</Text>
          <View style={styles.chipsRow}>
            {TIPOS_DOCUMENTO.map((tipo) => {
              const active = tipoDocumento === tipo.id;
              return (
                <TouchableOpacity
                  key={tipo.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => handleTipoDocumento(tipo.id)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{tipo.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextField
            label="Número de documento"
            placeholder="1234567890"
            keyboardType={tipoDocumento === 'CC' ? 'number-pad' : 'default'}
            autoCapitalize={tipoDocumento === 'Pasaporte' ? 'characters' : 'none'}
            value={form.numeroDocumento}
            onChangeText={update('numeroDocumento')}
            onBlur={() => markTouched('numeroDocumento')}
            error={showError('numeroDocumento', errors.numeroDocumento)}
          />

          <TextField
            label="Nacionalidad"
            placeholder="Ej. Colombiana"
            value={form.nacionalidad}
            onChangeText={update('nacionalidad')}
            onBlur={() => markTouched('nacionalidad')}
            error={showError('nacionalidad', errors.nacionalidad)}
          />

          {/* Fecha: nativo abre calendario DateTimePicker, web usa input
              type="date" (calendario + escritura). Ver DateField. */}
          <DateField
            value={fechaNacimiento}
            onChange={handleFechaChange}
            error={fechaError}
            maximumDate={new Date()}
          />

          <TextField
            label="Teléfono"
            placeholder="3000000000"
            keyboardType="phone-pad"
            value={form.telefono}
            onChangeText={update('telefono')}
            onBlur={() => markTouched('telefono')}
            error={showError('telefono', errors.telefono)}
          />
          <TextField
            label="Correo electrónico"
            placeholder="nombre@correo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={form.email}
            onChangeText={update('email')}
            onBlur={() => markTouched('email')}
            error={showError('email', errors.email)}
          />
          <TextField
            label="Contraseña"
            placeholder="••••••••"
            secureTextEntry
            value={form.password}
            onChangeText={update('password')}
            onBlur={() => markTouched('password')}
            error={showError('password', errors.password)}
          />
          <TextField
            label="Confirmar contraseña"
            placeholder="••••••••"
            secureTextEntry
            value={form.confirmPassword}
            onChangeText={update('confirmPassword')}
            onBlur={() => markTouched('confirmPassword')}
            error={showError('confirmPassword', errors.confirmPassword)}
          />

          <View style={styles.termsRow}>
            <TouchableOpacity
              style={styles.checkboxTouch}
              onPress={() => setAceptaLegal((prev) => !prev)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, aceptaLegal && styles.checkboxChecked]}>
                {aceptaLegal ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
            </TouchableOpacity>
            <Text style={styles.termsText}>
              Acepto los{' '}
              <Text
                style={styles.link}
                onPress={() => navigation.navigate('ProfessionalTermsRead')}
              >
                Términos y Condiciones
              </Text>{' '}
              y la{' '}
              <Text
                style={styles.link}
                onPress={() => navigation.navigate('ProfessionalPrivacyRead')}
              >
                Política de Tratamiento de Datos Personales (Ley 1581 de 2012)
              </Text>
            </Text>
          </View>

          {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label="Crear cuenta"
            onPress={handleSubmit}
            loading={loading}
            disabled={!aceptaLegal || !formValid}
            style={styles.submitButton}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: spacing.sm,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.white,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textOnNavyMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  fieldLabel: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  chipText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  checkboxTouch: {
    paddingTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  checkmark: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  termsText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  link: {
    color: colors.honey,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  submitError: {
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  submitButton: {
    marginBottom: 0,
  },
});
