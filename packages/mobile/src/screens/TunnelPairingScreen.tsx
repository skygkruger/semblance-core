// @i18n-pending — hardcoded English text, i18n keys in follow-up pass
import React from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { colors } from '../theme/tokens.js';

export function TunnelPairingScreen({ navigation }: { navigation: { goBack: () => void } }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bgDark }}>
      <View style={{ padding: 24 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.textTertiary, fontSize: 14 }}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: 'DMSans-Regular', fontSize: 17, color: colors.textPrimary, marginBottom: 16 }}>Compute Mesh</Text>
        <View style={{ backgroundColor: colors.surface1Dark, borderWidth: 1, borderColor: colors.borderDark, borderRadius: 12, padding: 20 }}>
          <Text style={{ fontFamily: 'DMSans-Light', fontSize: 13, color: colors.textTertiary, lineHeight: 20 }}>
            Pair devices for remote inference and knowledge sync over encrypted tunnels.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

export default TunnelPairingScreen;
