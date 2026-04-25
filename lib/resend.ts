import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY!);

export const FROM = {
  email: process.env.RESEND_FROM_EMAIL ?? "hello@kodex.eu",
  name: process.env.RESEND_FROM_NAME ?? "Kodex",
};

export async function sendWelcomeEmail(to: string, name: string) {
  return resend.emails.send({
    from: `${FROM.name} <${FROM.email}>`,
    to,
    subject: "Welcome to Kodex — let's get you compliant",
    html: `<p>Hi ${name},</p><p>Welcome to Kodex. Complete your onboarding to get your first compliance scan started.</p>`,
  });
}

export async function sendScanCompleteEmail(to: string, name: string, frameworkName: string, score: number) {
  return resend.emails.send({
    from: `${FROM.name} <${FROM.email}>`,
    to,
    subject: `Your ${frameworkName} compliance scan is complete`,
    html: `<p>Hi ${name},</p><p>Your ${frameworkName} scan is complete. You scored <strong>${score}%</strong>. View your full report in your dashboard.</p>`,
  });
}
