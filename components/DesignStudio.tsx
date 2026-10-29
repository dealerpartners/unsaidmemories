'use client';
import { useRef, useState } from 'react';
import { Stage, Layer, Rect, Text } from 'react-konva';
// Print area: bleed (outer), trim, safe zone (inner). Export at 300 DPI:
// target px = inches x 300, not CSS px.
export default function DesignStudio({ printWidthIn = 12, printHeightIn = 16 }: { printWidthIn?: number; printHeightIn?: number }) {
  const stageRef = useRef<any>(null);
  const [text, setText] = useState('Kin Keeper');
  const bleed = 9; const scale = 30;
  return (<div>
    <input value={text} onChange={e => setText(e.target.value)} />
    <Stage ref={stageRef} width={printWidthIn * scale + bleed * 2} height={printHeightIn * scale + bleed * 2}>
      <Layer>
        <Rect x={0} y={0} width={printWidthIn * scale + bleed * 2} height={printHeightIn * scale + bleed * 2} stroke="red" dash={[6, 4]} />
        <Rect x={bleed} y={bleed} width={printWidthIn * scale} height={printHeightIn * scale} stroke="black" />
        <Rect x={bleed + 18} y={bleed + 18} width={printWidthIn * scale - 36} height={printHeightIn * scale - 36} stroke="green" dash={[4, 4]} />
        <Text x={bleed + 24} y={bleed + 24} text={text} fontSize={28} />
      </Layer>
    </Stage>
    <p>Red = bleed, black = trim, green = safe zone. Export: {printWidthIn * 300} x {printHeightIn * 300} px at 300 DPI.</p>
  </div>);
}
