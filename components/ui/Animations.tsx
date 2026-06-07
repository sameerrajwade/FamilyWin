import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  runOnJS,
  Easing,
  interpolate,
} from 'react-native-reanimated';

const { width: W, height: H } = Dimensions.get('window');

const CONFETTI_COLORS = [
  '#6C63FF', '#FF6584', '#43D98F', '#FFB347', '#4FC3F7',
  '#FFD700', '#FF5C5C', '#26A69A', '#9C27B0', '#FF7043',
];

const CONFETTI_SHAPES = ['●', '■', '▲', '★', '♦'];

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  shape: string;
  delay: number;
  rotation: number;
  size: number;
}

function generatePieces(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * W,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    shape: CONFETTI_SHAPES[Math.floor(Math.random() * CONFETTI_SHAPES.length)],
    delay: Math.random() * 600,
    rotation: Math.random() * 720 - 360,
    size: 8 + Math.random() * 10,
  }));
}

interface ConfettiParticleProps {
  piece: ConfettiPiece;
  onDone?: () => void;
}

function ConfettiParticle({ piece, onDone }: ConfettiParticleProps) {
  const translateY = useSharedValue(-20);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(0);

  useEffect(() => {
    const drift = (Math.random() - 0.5) * 120;
    const duration = 1800 + Math.random() * 800;

    opacity.value = withDelay(piece.delay, withSequence(
      withTiming(1, { duration: 200 }),
      withDelay(duration - 400, withTiming(0, { duration: 400 })),
    ));

    scale.value = withDelay(piece.delay, withSpring(1, { damping: 8, stiffness: 120 }));

    translateY.value = withDelay(
      piece.delay,
      withTiming(H * 0.85, {
        duration,
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
      }),
    );

    translateX.value = withDelay(
      piece.delay,
      withTiming(drift, { duration, easing: Easing.out(Easing.sin) }),
    );

    rotate.value = withDelay(
      piece.delay,
      withTiming(piece.rotation, { duration, easing: Easing.linear }),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.Text
      style={[
        styles.particle,
        { left: piece.x, fontSize: piece.size, color: piece.color },
        style,
      ]}
    >
      {piece.shape}
    </Animated.Text>
  );
}

// ─── POINT BURST ANIMATION ────────────────────────────────────────────────────

interface PointBurstProps {
  points: number;
  visible: boolean;
  onComplete?: () => void;
}

export function PointBurst({ points, visible, onComplete }: PointBurstProps) {
  const scale = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;

    scale.value = withSequence(
      withSpring(1.4, { damping: 6, stiffness: 200 }),
      withDelay(600, withTiming(0, { duration: 300 })),
    );
    translateY.value = withTiming(-80, { duration: 900, easing: Easing.out(Easing.cubic) });
    opacity.value = withSequence(
      withTiming(1, { duration: 150 }),
      withDelay(500, withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) })),
    );

    if (onComplete) {
      setTimeout(onComplete, 1000);
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.pointBurst, animStyle]}>
      <Animated.Text style={styles.pointBurstText}>
        +{points} ⭐
      </Animated.Text>
    </Animated.View>
  );
}

// ─── MAIN CONFETTI COMPONENT ─────────────────────────────────────────────────

interface ConfettiProps {
  visible: boolean;
  count?: number;
  onComplete?: () => void;
}

export function Confetti({ visible, count = 60, onComplete }: ConfettiProps) {
  const pieces = useRef(generatePieces(count)).current;

  useEffect(() => {
    if (visible && onComplete) {
      const maxDelay = Math.max(...pieces.map((p) => p.delay));
      setTimeout(onComplete, maxDelay + 2600);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.confettiContainer} pointerEvents="none">
      {pieces.map((piece) => (
        <ConfettiParticle key={piece.id} piece={piece} />
      ))}
    </View>
  );
}

// ─── SCALE PRESS ANIMATION ────────────────────────────────────────────────────

interface ScalePressProps {
  onPress: () => void;
  children: React.ReactNode;
  style?: any;
  disabled?: boolean;
}

export function ScalePress({ onPress, children, style, disabled }: ScalePressProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    scale.value = withSpring(0.94, { damping: 15, stiffness: 400 });
  }

  function handlePressOut() {
    scale.value = withSpring(1, { damping: 12, stiffness: 300 });
  }

  return (
    <Animated.View style={[style, animStyle]}>
      <Animated.View
        onTouchStart={disabled ? undefined : handlePressIn}
        onTouchEnd={disabled ? undefined : () => { handlePressOut(); onPress(); }}
        onTouchCancel={disabled ? undefined : handlePressOut}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

// ─── SLIDE IN ANIMATION ───────────────────────────────────────────────────────

interface SlideInProps {
  children: React.ReactNode;
  delay?: number;
  from?: 'bottom' | 'left' | 'right';
  style?: any;
}

export function SlideIn({ children, delay = 0, from = 'bottom', style }: SlideInProps) {
  const translateY = useSharedValue(from === 'bottom' ? 40 : 0);
  const translateX = useSharedValue(from === 'left' ? -60 : from === 'right' ? 60 : 0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(delay, withSpring(0, { damping: 20, stiffness: 120 }));
    translateX.value = withDelay(delay, withSpring(0, { damping: 20, stiffness: 120 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[style, animStyle]}>{children}</Animated.View>;
}

// ─── COUNT UP NUMBER ─────────────────────────────────────────────────────────

interface CountUpProps {
  value: number;
  duration?: number;
  style?: any;
  prefix?: string;
  suffix?: string;
}

export function CountUp({ value, duration = 1200, style, prefix = '', suffix = '' }: CountUpProps) {
  const animValue = useSharedValue(0);
  const displayValue = useSharedValue(0);

  useEffect(() => {
    animValue.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value]);

  const animStyle = useAnimatedStyle(() => {
    displayValue.value = Math.round(animValue.value);
    return {};
  });

  return (
    <Animated.Text style={[style, animStyle]}>
      {prefix}{Math.round(animValue.value)}{suffix}
    </Animated.Text>
  );
}

// ─── SHIMMER LOADING ──────────────────────────────────────────────────────────

export function ShimmerBox({ width, height, borderRadius = 8, style }: {
  width: number | string; height: number; borderRadius?: number; style?: any;
}) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withSequence(
      withTiming(0.8, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
    );
    // Loop via repeating the effect in a setInterval
    const interval = setInterval(() => {
      opacity.value = withSequence(
        withTiming(0.8, { duration: 800 }),
        withTiming(0.3, { duration: 800 }),
      );
    }, 1600);
    return () => clearInterval(interval);
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: '#E5E7EB' }, style, animStyle]}
    />
  );
}

// ─── RANK CHANGE BADGE ────────────────────────────────────────────────────────

interface RankChangeBadgeProps {
  previousRank: number;
  currentRank: number;
}

export function RankChangeBadge({ previousRank, currentRank }: RankChangeBadgeProps) {
  const diff = previousRank - currentRank; // positive = moved up
  const isUp = diff > 0;

  // Hooks must be called unconditionally — before any early return
  const translateY = useSharedValue(isUp ? 10 : -10);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (diff === 0) return;
    translateY.value = withSpring(0, { damping: 12 });
    opacity.value = withTiming(1, { duration: 300 });
  }, [diff]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (diff === 0) return null;

  return (
    <Animated.View style={[styles.rankBadge, { backgroundColor: isUp ? '#B8F5DA' : '#FFB3B3' }, animStyle]}>
      <Animated.Text style={[styles.rankBadgeText, { color: isUp ? '#43D98F' : '#FF5C5C' }]}>
        {isUp ? `▲${diff}` : `▼${Math.abs(diff)}`}
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  confettiContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  particle: {
    position: 'absolute',
    top: 0,
    fontWeight: 'bold',
  },
  pointBurst: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 100,
    backgroundColor: 'rgba(108, 99, 255, 0.95)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 32,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  pointBurstText: {
    fontSize: 26,
    fontFamily: 'Nunito-Black',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  rankBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  rankBadgeText: {
    fontSize: 11,
    fontFamily: 'Nunito-Bold',
  },
});
