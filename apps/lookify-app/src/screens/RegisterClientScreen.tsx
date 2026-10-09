// src/screens/RegisterClientScreen.tsx
// Formulario de registro para Cliente (frontend mock; sin backend todavía).

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import DateTimePicker, {
  DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { colors, radius, spacing, typography } from '../theme/colors';
import Button from '../components/Button';
import TextField from '../components/TextField';
import BackHeader from '../components/BackHeader';
import { isEmailRegistered, registerMockUser } from '../data/mockUsers';
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
import {
  CLIENT_DATA_POLICY_VERSION,
} from '../constants/legal/dataPolicyClientMeta';
import { CLIENT_TERMS_VERSION } from '../constants/legal/termsClientMeta';

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

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterClient'>;

function formatFecha(date: Date | null): string {
  if (!date) return 'Selecciona tu fecha de nacimiento';
  return date.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function correoYaRegistradoError(email: string): string | null {
  if (validarCorreo(email) !== null) return null;
  return isEmailRegistered(email) ? 'Este correo ya está registrado' : null;
}

export default function RegisterClientScreen({ navigation }: Props) {
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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [fechaTouched, setFechaTouched] = useState(false);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
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

  const update = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onDateChange = (_event: DateTimePickerChangeEvent, selected: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    setFechaNacimiento(selected);
    setFechaTouched(true);
  };

  const closeDatePicker = () => {
    setShowDatePicker(false);
    setFechaTouched(true);
  };

  const errors = useMemo(() => {
    const emailFormat = validarCorreo(form.email);
    const emailDuplicate =
      emailFormat === null && isEmailRegistered(form.email)
        ? 'Este correo ya está registrado'
        : null;

    return {
      nombre: validarNombre(form.nombre),
      numeroDocumento: validarDocumento(tipoDocumento, form.numeroDocumento),
      nacionalidad: validarNacionalidad(form.nacionalidad),
      fecha: validarFechaNacimiento(fechaNacimiento),
      telefono: validarTelefono(form.telefono),
      email: emailFormat ?? emailDuplicate,
      password: validarContrasenaRegistro(form.password),
      confirmPassword: validarConfirmarContrasena(form.password, form.confirmPassword),
    };
  }, [form, tipoDocumento, fechaNacimiento]);

  const showError = (key: FieldKey, message: string | null) =>
    touched[key] && message ? message : undefined;

  const fechaError = fechaTouched && errors.fecha ? errors.fecha : undefined;

  const formValid =
    registroClienteValido({
      ...form,
      tipoDocumento,
      fechaNacimiento,
    }) && correoYaRegistradoError(form.email) === null;

  const handleSubmit = () => {
    if (!aceptaTerminos || !formValid) return;
    const aceptadoEn = new Date().toISOString();
    registerMockUser({
      email: form.email,
      password: form.password,
      nombre: form.nombre.trim(),
      consentimiento: {
        terminos: { version: CLIENT_TERMS_VERSION, aceptadoEn },
        politicaDatos: { version: CLIENT_DATA_POLICY_VERSION, aceptadoEn },
      },
    });
    navigation.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  };

  const handleTipoDocumento = (tipo: TipoDocumentoId) => {
    setTipoDocumento(tipo);
    if (touched.numeroDocumento) {
      markTouched('numeroDocumento');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackHeader variant="dark" />
        <Text style={styles.title}>Crear cuenta de cliente</Text>
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

          <Text style={styles.fieldLabel}>Fecha de nacimiento</Text>
          <TouchableOpacity
            style={[styles.dateButton, fechaError ? styles.dateButtonError : null]}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={[styles.dateButtonText, !fechaNacimiento && styles.datePlaceholder]}>
              {formatFecha(fechaNacimiento)}
            </Text>
          </TouchableOpacity>
          {fechaError ? <Text style={styles.fieldError}>{fechaError}</Text> : null}
          {showDatePicker && (
            <DateTimePicker
              value={fechaNacimiento ?? new Date(2000, 0, 1)}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date()}
              onValueChange={onDateChange}
              onDismiss={closeDatePicker}
            />
          )}
          {Platform.OS === 'ios' && showDatePicker && (
            <TouchableOpacity style={styles.dateDone} onPress={closeDatePicker}>
              <Text style={styles.dateDoneText}>Listo</Text>
            </TouchableOpacity>
          )}

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
              onPress={() => setAceptaTerminos((prev) => !prev)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, aceptaTerminos && styles.checkboxChecked]}>
                {aceptaTerminos ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
            </TouchableOpacity>
            <Text style={styles.termsText}>
              Acepto los{' '}
              <Text
                style={styles.link}
                onPress={() => navigation.navigate('ClientTermsRead')}
              >
                Términos y Condiciones
              </Text>{' '}
              y la{' '}
              <Text
                style={styles.link}
                onPress={() => navigation.navigate('ClientPrivacyRead')}
              >
                Política de Tratamiento de Datos Personales (Ley 1581 de 2012)
              </Text>
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label="Crear cuenta"
            onPress={handleSubmit}
            disabled={!aceptaTerminos || !formValid}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  fieldLabel: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  fieldError: {
    fontSize: 12,
    color: colors.error,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
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
  dateButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
  },
  dateButtonError: {
    borderColor: colors.error,
    marginBottom: spacing.xs,
  },
  dateButtonText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  datePlaceholder: {
    color: colors.textMuted,
  },
  dateDone: {
    alignSelf: 'flex-end',
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  dateDoneText: {
    color: colors.honey,
    fontWeight: '600',
    fontSize: 14,
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
    marginTop: 2,
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
