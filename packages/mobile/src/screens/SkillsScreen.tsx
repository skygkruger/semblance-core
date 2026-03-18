import React from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';

export function SkillsScreen({ navigation }: { navigation: { goBack: () => void } }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0B0E11' }}>
      <View style={{ padding: 24 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 16 }}>
          <Text style={{ color: '#8593A4', fontSize: 14 }}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: 'DMSans-Regular', fontSize: 17, color: '#EEF1F4', marginBottom: 16 }}>Skills</Text>
        <View style={{ backgroundColor: '#111518', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: 20 }}>
          <Text style={{ fontFamily: 'DMSans-Light', fontSize: 13, color: '#8593A4', lineHeight: 20 }}>
            Install and manage third-party skill packages that run locally.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

export default SkillsScreen;
