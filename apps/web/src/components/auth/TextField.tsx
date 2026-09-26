type Props = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | undefined }

// 1d 인풋: 라벨 13px/600 gap 6, h46 border line radius 10 padding 0 14 15px
export function TextField({ label, error, id, ...input }: Props) {
  const inputId = id ?? input.name
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1.5 text-[13px] font-semibold">
      {label}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={`h-[46px] rounded-[10px] border bg-surface px-3.5 text-[15px] font-normal text-ink outline-none focus:border-ink ${
          error ? 'border-danger' : 'border-line'
        }`}
        {...input}
      />
      {error && (
        <span id={`${inputId}-error`} className="text-xs font-normal text-danger">
          {error}
        </span>
      )}
    </label>
  )
}
