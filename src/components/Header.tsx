import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Left = 'menu' | 'back' | 'close' | 'cancel' | 'none';
type Right = 'new' | 'more' | 'both' | 'add' | 'text' | 'none';

type Props = {
  left?: Left;
  right?: Right;
  title?: string;
  sub?: string;
  /** Title becomes a button with a chevron (opens the model picker). */
  onTitlePress?: () => void;
  onLeft?: () => void;
  onNew?: () => void;
  onMore?: () => void;
  onAdd?: () => void;
  addLabel?: string;
  rightText?: string;
  onRightText?: () => void;
};

function IconButton({ icon, label, onPress, size = 22 }: { icon: IconName; label: string; onPress?: () => void; size?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size} color={colors.text} />
    </Pressable>
  );
}

export function Header({
  left = 'menu',
  right = 'none',
  title,
  sub,
  onTitlePress,
  onLeft,
  onNew,
  onMore,
  onAdd,
  addLabel = 'Add',
  rightText,
  onRightText,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const back = onLeft ?? (() => (router.canGoBack() ? router.back() : router.replace('/' as Href)));

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingTop: Math.max(insets.top, 12) + 4,
        paddingHorizontal: 6,
        paddingBottom: 6,
        backgroundColor: colors.bg,
      }}>
      <View style={{ width: 88, flexDirection: 'row', alignItems: 'center' }}>
        {left === 'menu' && <IconButton icon="menu" label="Open menu" onPress={onLeft} />}
        {left === 'back' && <IconButton icon="back" label="Back" onPress={back} />}
        {left === 'close' && <IconButton icon="close" label="Close" onPress={back} size={20} />}
        {left === 'cancel' && (
          <Pressable accessibilityRole="button" onPress={back} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 10 }}>
            <Text color="text2">Cancel</Text>
          </Pressable>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
        {onTitlePress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title}, change model`}
            onPress={onTitlePress}
            style={{ alignItems: 'center', gap: 1, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, minHeight: 44, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text size={16} weight="semi" numberOfLines={1}>{title}</Text>
              <Icon name="chevronDown" size={14} color={colors.muted} strokeWidth={2} />
            </View>
            {sub ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent }} />
                <Text size={11.5} color="muted">{sub}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : (
          <View style={{ alignItems: 'center', gap: 1, minHeight: 44, justifyContent: 'center' }}>
            {title ? <Text size={16} weight="semi" numberOfLines={1}>{title}</Text> : null}
            {sub ? <Text size={11.5} color="muted">{sub}</Text> : null}
          </View>
        )}
      </View>

      <View style={{ width: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
        {(right === 'new' || right === 'both') && <IconButton icon="edit" label="New chat" onPress={onNew} size={21} />}
        {(right === 'more' || right === 'both') && <IconButton icon="more" label="More options" onPress={onMore} size={20} />}
        {right === 'add' && <IconButton icon="plus" label={addLabel} onPress={onAdd} />}
        {right === 'text' && (
          <Pressable accessibilityRole="button" onPress={onRightText} style={{ height: 44, justifyContent: 'center', paddingHorizontal: 10 }}>
            <Text color="accent" weight="semi">{rightText}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
