import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Cloud } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";

export function AuthDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { signInWithPassword, signUpWithPassword } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setEmail("");
    setPassword("");
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      toast.error("Preencha e-mail e senha");
      return;
    }
    setSubmitting(true);
    const action = tab === "signin" ? signInWithPassword : signUpWithPassword;
    const { error } = await action(email.trim(), password);
    setSubmitting(false);

    if (error) {
      toast.error(error);
      return;
    }

    if (tab === "signup") {
      toast.success(
        "Pedido enviado! Confirme seu e-mail, se solicitado, e aguarde um administrador liberar seu perfil.",
      );
    } else {
      toast.success("Login realizado. Sincronizando seus modelos…");
    }
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-accent" />
            Sincronizar na nuvem
          </DialogTitle>
          <DialogDescription>
            Entre para salvar seus modelos na nuvem e acessá-los de qualquer dispositivo.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Solicitar acesso</TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="mt-4 space-y-3">
            <AuthForm
              mode="signin"
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              onSubmit={handleSubmit}
            />
          </TabsContent>
          <TabsContent value="signup" className="mt-4 space-y-3">
            <AuthForm
              mode="signup"
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              onSubmit={handleSubmit}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : tab === "signin" ? (
              "Entrar"
            ) : (
              "Enviar pedido"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuthForm({
  mode,
  email,
  setEmail,
  password,
  setPassword,
  onSubmit,
}: {
  mode: "signin" | "signup";
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  onSubmit: () => void;
}) {
  // IDs e autoComplete são derivados do modo: os dois formulários (entrar/criar
  // conta) coexistem no mesmo componente e cada Tab pode ficar montada, então
  // ids fixos duplicavam no DOM e o navegador tratava "criar conta" como login
  // (sugerindo senha salva em vez de gerar uma nova).
  const emailId = `auth-email-${mode}`;
  const passwordId = `auth-password-${mode}`;
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={emailId}>E-mail</Label>
        <Input
          id={emailId}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@empresa.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={passwordId}>Senha</Label>
        <Input
          id={passwordId}
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
      </div>
    </>
  );
}
