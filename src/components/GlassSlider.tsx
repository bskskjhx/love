import { Slider } from 'radix-ui'

interface Props {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  label: string
  valueText?: string
}

export function GlassSlider({ value, min, max, step, onChange, label, valueText }: Props) {
  return (
    <Slider.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([v]) => onChange(v)}
      className="relative flex h-7 min-w-0 flex-1 touch-none items-center select-none"
    >
      <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-[linear-gradient(90deg,var(--fill2),var(--accent))]" />
      <Slider.Thumb
        aria-label={label}
        aria-valuetext={valueText}
        className="block h-6 w-[38px] rounded-full bg-white shadow-[inset_0_1px_0.5px_rgb(255_255_255/0.9),0_0_0_0.5px_rgb(0_0_0/0.12),0_3px_8px_rgb(0_0_0/0.18)] transition-transform duration-[250ms] ease-[cubic-bezier(0.3,1.4,0.5,1)] outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[1.15]"
      />
    </Slider.Root>
  )
}
