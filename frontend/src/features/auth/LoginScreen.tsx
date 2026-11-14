import React, { useState } from "react";
import { GlassCard } from "../../components/common/GlassCard";
import { Button } from "../../components/common/Button";
import { ShivamLogo } from "../../components/common/ShivamLogo";
import { IOSSegmentedSwitch } from "../../components/common/IOSSegmentedSwitch";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { authAPI } from "../../services/api";
import { Phone, User, KeyRound, Eye, EyeOff, ArrowRight, CheckCircle2, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setError(null);
    setPin("");
    setConfirmPin("");
  };

  const handleTabChange = (tab: "login" | "register") => {
    setActiveTab(tab);
    resetForm();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPhone = phone.trim().replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      setError(t.phoneLengthError);
      return;
    }

    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setError(t.pinLengthError);
      return;
    }

    setIsLoading(true);
    try {
      const data = await authAPI.login(cleanPhone, pin);
      login(data.access_token, data.user);
      if (data.user?.role === "SUPER_ADMIN") {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Invalid credentials. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError(t.nameRequiredError);
      return;
    }

    const cleanPhone = phone.trim().replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      setError(t.phoneLengthError);
      return;
    }

    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setError(t.pinLengthError);
      return;
    }

    if (pin !== confirmPin) {
      setError(t.pinsDoNotMatch);
      return;
    }

    setIsLoading(true);
    try {
      const data = await authAPI.register(fullName.trim(), cleanPhone, pin, confirmPin);
      login(data.access_token, data.user);
      if (data.user?.role === "SUPER_ADMIN") {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Registration failed. Please check details.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center py-4">
      <div className="text-center mb-5">
        <div className="flex justify-center mb-3">
          <div className="relative">
            <div className="absolute -inset-2 bg-brand-primary/20 rounded-3xl blur-md" />
            <div className="relative p-2 rounded-2xl glass-card border border-white/60">
              <ShivamLogo size={64} />
            </div>
          </div>
        </div>
        <h2 className="text-xl font-bold text-brand-dark">{t.loginWelcome}</h2>
        <p className="text-xs text-brand-muted mt-1 px-4">{t.loginDesc}</p>
      </div>

      <GlassCard className="relative overflow-hidden">
        {/* Navigation Tabs - iOS Liquid Capsule Switch */}
        <div className="mb-5">
          <IOSSegmentedSwitch<"login" | "register">
            options={[
              { value: "login", label: t.loginTab, icon: <Lock className="w-3.5 h-3.5" /> },
              { value: "register", label: t.registerTab, icon: <User className="w-3.5 h-3.5" /> },
            ]}
            value={activeTab}
            onChange={handleTabChange}
            size="md"
            className="w-full"
          />
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 text-xs font-medium">
            {error}
          </div>
        )}

        {activeTab === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-brand-dark mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-brand-muted" />
                <span>{t.enterPhone}</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-xs font-bold text-brand-muted">
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  className="glass-input pl-12 text-sm font-medium tracking-wide"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-brand-dark flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-brand-muted" />
                  <span>{t.sixDigitPin}</span>
                </label>
              </div>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="••••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  className="glass-input pr-10 text-base font-bold tracking-widest"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-3 text-brand-muted hover:text-brand-dark transition-colors"
                  aria-label={showPin ? t.hidePin : t.showPin}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              isLoading={isLoading}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              {t.loginButton}
            </Button>

            <div className="pt-2 text-center">
              <p className="text-[11px] text-brand-muted">
                {t.forgotPin}
              </p>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-brand-dark mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-brand-muted" />
                <span>{t.enterFullName}</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Ramesh Patil"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="glass-input text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-dark mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-brand-muted" />
                <span>{t.enterPhone}</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-xs font-bold text-brand-muted">
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  className="glass-input pl-12 text-sm font-medium tracking-wide"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-dark mb-1.5 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-brand-muted" />
                <span>{t.sixDigitPin}</span>
              </label>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="6-digit PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  className="glass-input pr-10 text-base font-bold tracking-widest"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-3 text-brand-muted hover:text-brand-dark transition-colors"
                  aria-label={showPin ? t.hidePin : t.showPin}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-dark mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-brand-muted" />
                <span>{t.confirmPin}</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPin ? "text" : "password"}
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Confirm 6-digit PIN"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                  className="glass-input pr-10 text-base font-bold tracking-widest"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPin(!showConfirmPin)}
                  className="absolute right-3 top-3 text-brand-muted hover:text-brand-dark transition-colors"
                  aria-label={showConfirmPin ? t.hidePin : t.showPin}
                >
                  {showConfirmPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              isLoading={isLoading}
              icon={<CheckCircle2 className="w-4 h-4" />}
            >
              {t.registerButton}
            </Button>
          </form>
        )}
      </GlassCard>
    </div>
  );
};
