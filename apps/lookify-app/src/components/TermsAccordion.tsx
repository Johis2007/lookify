// src/components/TermsAccordion.tsx
// Bloque reutilizable de términos: acordeón que expande un texto legal con
// scroll INTERNO (no es popup ni enlace externo). El contenido se recibe por
// props para reutilizar los textos de constants/legal en cada flujo.
// Ejemplo:
//   <TermsAccordion title="📄 Términos y condiciones" text={TERMS_TEXT} extra={PRO_CLAUSE} />

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme/colors';

type Props = {
  title?: string;
  text: string;
  extra?: string;
};

export function TermsAccordion({ title = '📄 Términos y condiciones', text, extra }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.box}>
      <Pressable onPress={() => setOpen(!open)} style={styles.head}>
        <Text style={styles.headT}>{title}</Text>
        <Text style={styles.headC}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && (
        <ScrollView style={styles.body} nestedScrollEnabled showsVerticalScrollIndicator>
          <Text style={styles.termsT}>{text}</Text>
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
  box: { backgroundColor: colors.surfaceLow, borderRadius: radius.md, borderWidth: 1, borderColor: colors.surfaceHigh, overflow: 'hidden' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 13 },
  headT: { fontSize: 13, fontWeight: '800', color: colors.onSurface },
  headC: { fontSize: 12, color: colors.onSurfaceVariant },
  body: { maxHeight: 220, paddingHorizontal: 13, paddingBottom: 13 },
  termsT: { fontSize: 12, lineHeight: 18, color: colors.onSurface },
  sep: { textAlign: 'center', color: colors.outline, marginVertical: 6 },
});
