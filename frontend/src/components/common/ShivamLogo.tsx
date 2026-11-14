import React from "react";
import logoImg from "../../assets/logo.png";
import logoCircleImg from "../../assets/logo-circle.png";

interface ShivamLogoProps {
  className?: string;
  size?: number;
  variant?: "squircle" | "circle";
  alt?: string;
}

export const ShivamLogo: React.FC<ShivamLogoProps> = ({
  className = "",
  size = 64,
  variant = "squircle",
  alt = "Shivam Patsanstha Logo",
}) => {
  const src = variant === "circle" ? logoCircleImg : logoImg;

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={`inline-block object-contain select-none transition-transform ${className}`}
      style={{ width: size, height: size }}
      loading="eager"
      decoding="async"
    />
  );
};
