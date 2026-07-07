import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const UserQuickTools = style({
  backgroundColor: color.Background.Container,
  color: color.Background.OnContainer,
  position: 'absolute',
  zIndex: '1000',
  height: toRem(74),
  bottom: '0',
  left: toRem(-66),
  padding: config.space.S300,
  borderTop: `${config.borderWidth.B300} solid ${color.Background.ContainerLine}`,
});
