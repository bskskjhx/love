import { Switch as RadixSwitch } from 'radix-ui'

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className="relative h-[31px] w-[51px] shrink-0 rounded-full bg-fill2 transition-colors duration-300 data-[state=checked]:bg-[#34c759]"
    >
      <RadixSwitch.Thumb className="absolute top-[2px] left-[2px] block h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.16)] transition-transform duration-500 ease-[var(--spring-bouncy)] data-[state=checked]:translate-x-[20px]" />
    </RadixSwitch.Root>
  )
}
