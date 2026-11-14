import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  isLoading = false,
  icon,
  className = "",
  disabled,
  ...props
}) => {
  let baseClass = "btn-primary";
  if (variant === "secondary") baseClass = "btn-secondary";
  else if (variant === "ghost")
    baseClass =
      "text-brand-dark hover:bg-white/40 active:scale-95 font-medium px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2";
  else if (variant === "danger")
    baseClass =
      "bg-red-500/80 hover:bg-red-600/90 text-white font-medium px-4 py-2.5 rounded-xl transition-all active:scale-95 shadow-md flex items-center justify-center gap-2";

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseClass} ${(disabled || isLoading) ? "opacity-60 cursor-not-allowed pointer-events-none" : ""} ${className}`}
      {...props}
    >
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
      <span>{children}</span>
    </button>
  );
};

