import { AuthForm } from '@/components/auth-form';

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <AuthForm mode="sign-up" />
    </main>
  );
}
