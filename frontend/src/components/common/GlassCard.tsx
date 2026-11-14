import React from "react";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  subtle?: boolean;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = "",
  subtle = false,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`${
        subtle ? "glass-card-subtle" : "glass-card"
      } p-5 transition-all duration-200 ${
        onClick ? "cursor-pointer hover:shadow-glassHover active:scale-[0.99]" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
};

