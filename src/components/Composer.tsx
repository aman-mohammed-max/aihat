import { Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as haptic from '@/lib/haptics';
import { useKeyboardVisible } from '@/lib/keyboard';
import { useSettings } from '@/store/settings';
import { fonts, radii, useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ComposerFile = { id: string; ext: string; label: string; meta?: string };

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  placeholder?: string;
  files?: ComposerFile[];
  onRemoveFile?: (id: string) => void;
  searchOn?: boolean;
  imageOn?: boolean;
  uiOn?: boolean;
  onToggleUi?: () => void;
  onImageOptions?: () => void;
  imageLabel?: string;
  onToggleSearch?: () => void;
  onToggleImage?: () => void;
  onAdd?: () => void;
  onTools?: () => void;
  onVoice?: () => void;
  /** Opens the command list (puts a / in the box). */
  onSlash?: () => void;
};

function RoundButton({ label, onPress, children, bg, size = 38 }: { label: string; onPress?: () => void; children: React.ReactNode; bg?: string; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => { haptic.tap(); onPress?.(); }}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] })}>
      {children}
    </Pressable>
  );
}

function ModeChip({ icon, label, onPress, onClear }: { icon: IconName; label: string; onPress?: () => void; onClear?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ height: 32, borderRadius: 16, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={onClear ? `${label} options` : `${label} on, tap to turn off`}
        onPress={() => { haptic.select(); onPress?.(); }}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: onClear ? 0 : 6 }}
        style={{ height: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: onClear ? 4 : 10 }}>
        <Icon name={icon} size={14} color={colors.accent} />
        <Text size={13} color="accent">{label}</Text>
      </Pressable>
      {onClear ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Turn off ${label}`} onPress={() => { haptic.select(); onClear(); }} hitSlop={{ top: 6, bottom: 6, left: 0, right: 6 }} style={{ width: 28, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" size={12} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Composer({
  value, onChangeText, onSend, placeholder = 'Message', files = [], onRemoveFile,
  searchOn, imageOn, uiOn, onToggleSearch, onToggleImage, onToggleUi, onImageOptions, imageLabel, onAdd, onTools, onVoice, onSlash,
}: Props) {
  const { colors, body } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const sendWithEnter = useSettings((s) => s.sendWithEnter);
  return (
    <View style={{ paddingTop: 8, paddingHorizontal: 12, paddingBottom: keyboard ? 8 : Math.max(insets.bottom, 12) + 4, backgroundColor: colors.bg }}>
      <View style={{ backgroundColor: colors.surface, borderRadius: radii.composer, padding: 8, gap: 4 }}>
        {files.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 2, paddingBottom: 4 }}>
            {files.map((f) => (
              <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface2, borderRadius: 12, paddingVertical: 6, paddingLeft: 8, paddingRight: 6 }}>
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' }}>
                  <Text mono weight="medium" size={9.5}>{f.ext}</Text>
                </View>
                <View style={{ gap: 1 }}>
                  <Text size={12.5} numberOfLines={1} style={{ maxWidth: 120 }}>{f.label}</Text>
                  {f.meta ? <Text size={11} color="muted">{f.meta}</Text> : null}
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Remove file" onPress={() => onRemoveFile?.(f.id)} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="close" size={14} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
        <TextInput
          accessibilityLabel="Message"
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          multiline
          submitBehavior={sendWithEnter ? 'submit' : 'newline'}
          onSubmitEditing={sendWithEnter ? onSend : undefined}
          style={{ color: colors.text, fontSize: body, fontFamily: fonts.ui, paddingHorizontal: 8, paddingVertical: 8, maxHeight: 140 }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <RoundButton label="Add files, photos or images" onPress={onAdd} bg={colors.surface2}>
            <Icon name="plus" size={18} color={colors.text} strokeWidth={2} />
          </RoundButton>
          <RoundButton label="Commands" onPress={onSlash}>
            <Text mono size={17} weight="medium" color="text2">/</Text>
          </RoundButton>
          <RoundButton label="Tools for this chat" onPress={onTools}>
            <Icon name="sliders" size={18} color={colors.text2} />
          </RoundButton>
          {searchOn && <ModeChip icon="globe" label="Search" onPress={onToggleSearch} />}
          {imageOn && <ModeChip icon="sparkle" label={imageLabel ? `Image · ${imageLabel}` : 'Image'} onPress={onImageOptions} onClear={onToggleImage} />}
          {uiOn && <ModeChip icon="layout" label="UI" onPress={onToggleUi} />}
          <View style={{ flex: 1 }} />
          <RoundButton label="Dictate" onPress={onVoice}>
            <Icon name="mic" size={19} color={colors.text2} />
          </RoundButton>
          <RoundButton label="Send" onPress={onSend} bg={colors.accent}>
            <Icon name="send" size={18} color={colors.onAccent} strokeWidth={2.2} />
          </RoundButton>
        </View>
      </View>
    </View>
  );
}
