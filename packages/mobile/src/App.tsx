import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function App(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Semblance</Text>
      <Text style={styles.tagline}>
        Your Intelligence. Your Device. Your Rules.
      </Text>
      <Text style={styles.status}>Sprint 1 — Scaffolding Complete</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1D2E',
    padding: 24,
  },
  title: {
    fontFamily: 'DM Serif Display',
    fontSize: 48,
    fontWeight: '700',
    color: '#ECEDF0',
    marginBottom: 16,
  },
  tagline: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: '400',
    color: '#9BA0B0',
    textAlign: 'center',
    marginBottom: 32,
  },
  status: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '500',
    color: '#4A7FBA',
  },
});
