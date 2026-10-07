import React from 'react';
import { Composition } from 'remotion';
import { CanvasWorldComposition } from './RemotionComposition';
import { blankCanvas } from './canvas-world';

export const RemotionRoot: React.FC = () => <Composition
  id="CanvasWorld"
  component={CanvasWorldComposition}
  durationInFrames={blankCanvas.durationInFrames}
  fps={30}
  width={1080}
  height={1920}
  defaultProps={{ input: blankCanvas }}
/>;
