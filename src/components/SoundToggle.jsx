import { useEffect, useState } from 'react';
import { isSoundEnabled, onSoundChange, setSoundEnabled } from '../lib/spaceAudio';

export default function SoundToggle() {
  const [on, setOn] = useState(isSoundEnabled);
  useEffect(() => onSoundChange(setOn), []);
  return (
    <button
      type="button"
      data-sound="off"
      data-tour="sound"
      className="sound-toggle fixed right-4 bottom-4 z-40 px-2.5! py-1.5! text-[0.7rem]! text-[#b7b7c0] opacity-70 hover:opacity-100"
      aria-pressed={on}
      title={on ? 'Mute space sound' : 'Enable space sound'}
      onClick={() => setSoundEnabled(!on)}
    >
      {on ? 'Sound on' : 'Sound off'}
    </button>
  );
}
