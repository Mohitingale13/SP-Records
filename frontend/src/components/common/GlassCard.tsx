import React from "react";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  subtle?: boolean;
  id?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = "",
  subtle = false,
  id,
  onClick,
}) => {
  return (
    <div
      id={id}
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

