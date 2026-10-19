import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stitch } from '@/constants/StitchTheme';

// Texto legal completo (ES-CO). Se muestra desplegado dentro del formulario.
export const TERMS_TEXT = `TÉRMINOS Y CONDICIONES DE USO — LOOKIFY

1. OBJETO. Lookify es una plataforma que conecta clientes con profesionales
independientes de belleza y bienestar para servicios a domicilio en Colombia.
Lookify no es empleador ni contratista de los profesionales.

2. CUENTA Y ROL. Al registrarte eliges un rol único y permanente: CLIENTE o
PROFESIONAL. La cuenta queda fijada a ese rol y no puede cambiarse después.
Si necesitas el otro rol, debes crear una cuenta nueva con otro correo.

3. SERVICIOS Y PRECIOS. El precio base lo fija Lookify por catálogo. El
profesional puede ajustarlo ±20% según experiencia y certificaciones. El
domicilio se cobra por separado según distancia.

4. PAGOS. El cliente paga por la app (tarjeta/PSE/efectivo según cobertura).
Lookify retiene 15% por intermediación y póliza de bioseguridad. El 100% de
las propinas es del profesional.

5. CANCELACIONES. Cancelación gratuita dentro de los 5 minutos siguientes a
la asignación. Después aplican cargos de desplazamiento. El no-show del
profesional conlleva suspensión de 24 horas.

6. CONDUCTA Y SEGURIDAD. Queda prohibido el acoso, el fraude, compartir
datos de contacto para evadir la plataforma y cualquier conducta que ponga
en riesgo a las partes. Lookify puede suspender cuentas que incumplan.

7. RESPONSABILIDAD. Lookify verifica identidad, antecedentes aportados y
documentos de idoneidad de los profesionales, pero el servicio lo presta el
profesional independiente, responsable de su kit, bioseguridad y resultados.

8. HABEAS DATA (Ley 1581 de 2012). Al aceptar autorizas el tratamiento de
tus datos personales (identificación, contacto, ubicación del servicio,
fotos y documentos aportados) para operar la plataforma, prevenir fraude y
cumplir obligaciones legales. Puedes consultar, actualizar, rectificar o
suprimir tus datos escribiendo a habeasdata@lookify.app. Tus datos no se
venden ni se comparten con terceros con fines publicitarios.

9. SOPORTE. Soporte 24/7 en la app y en soporte@lookify.app.

Última actualización: 2026. Al marcar la casilla declaras haber leído y
aceptado este texto completo.`;

// Cláusula adicional exclusiva del flujo profesional.
export const PRO_CLAUSE = `CLÁUSULA PROFESIONAL ADICIONAL. Declaro bajo gravedad de juramento que
los documentos aportados (certificado técnico, licencia, diploma o registro
sanitario) son auténticos, vigentes y me pertenecen. Acepto que mi cuenta
queda en estado PENDIENTE y no podré recibir solicitudes hasta que un
administrador de Lookify revise y apruebe mi documentación. Entiendo que
presentar documentos falsos causa el rechazo definitivo y el reporte a las
autoridades competentes.`;

// Bloque reutilizable de términos: acordeón que expande el texto legal con
// scroll INTERNO (no es popup ni enlace externo). Véase spec de registro.
export function TermsAccordion({ extra }: { extra?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.box}>
      <Pressable onPress={() => setOpen(!open)} style={styles.head}>
        <Text style={styles.headT}>📄 Términos y condiciones</Text>
        <Text style={styles.headC}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && (
        <ScrollView style={styles.body} nestedScrollEnabled showsVerticalScrollIndicator>
          <Text style={styles.termsT}>{TERMS_TEXT}</Text>
          {extra ? (
            <>
              <Text style={styles.sep}>──────────</Text>
              <Text style={styles.termsT}>{extra}</Text>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: Stitch.colors.surfaceLow, borderRadius: 12, borderWidth: 1, borderColor: Stitch.colors.surfaceHigh, overflow: 'hidden' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 13 },
  headT: { fontSize: 13, fontWeight: '800', color: Stitch.colors.onSurface },
  headC: { fontSize: 12, color: Stitch.colors.onSurfaceVariant },
  body: { maxHeight: 220, paddingHorizontal: 13, paddingBottom: 13 },
  termsT: { fontSize: 12, lineHeight: 18, color: Stitch.colors.onSurface },
  sep: { textAlign: 'center', color: Stitch.colors.outline, marginVertical: 6 },
});
