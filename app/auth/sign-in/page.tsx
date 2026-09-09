import { AuthForm } from '@/components/auth-form';

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
      <AuthForm mode="sign-in" />
    </main>
  );
}
