import { EmailTemplate } from "src/common/enums/mail-templates.enum";


export class EmailTemplateResolver {
  static resolve(
    template: EmailTemplate,
    context: Record<string, any>,
  ): string {
    switch (template) {
      /**
       * 🎤 Artist Onboard Template
       */
      case EmailTemplate.ARTIST_ONBOARD:
        return `
          <div style="font-family: Inter, sans-serif; color: #333;">
            <h2>Welcome to ${context.platformName} 🎶</h2>
            <p>Hi <strong>${context.artistName}</strong>,</p>
            <p>Your artist profile has been successfully added to our platform.</p>
            <p>Here are your login credentials:</p>
            <div style="background:#f3f8ff;padding:12px;border-radius:8px;font-family:monospace;">
              <p><strong>Email:</strong> ${context.email}</p>
              <p><strong>Password:</strong> ${context.password}</p>
            </div>
            <p>You can log in here: <a href="${context.loginUrl}">${context.loginUrl}</a></p>
            <br/>
            <p>Keep shining,<br/>The ${context.platformName} Team</p>
            <hr/>
            <small style="color:#999;">© ${context.year} ${context.platformName}. All rights reserved.</small>
          </div>
        `;

      /**
       * 🪩 Artist Profile Updated Template
       */
      case EmailTemplate.ARTIST_PROFILE_UPDATED:
        return `
          <div style="font-family: Inter, sans-serif; color: #333;">
            <h2>Profile Updated Successfully ✅</h2>
            <p>Hi ${context.artistName},</p>
            <p>Your artist profile has been updated on <strong>${context.platformName}</strong>.</p>
            <p>View your profile: <a href="${context.profileUrl}">${context.profileUrl}</a></p>
            <p>Stay creative,<br/>The ${context.platformName} Team</p>
            <hr/>
            <small style="color:#999;">© ${context.year} ${context.platformName}</small>
          </div>
        `;

      /**
       * ⚙️ Equipment Provider Onboard Template
       */
      case EmailTemplate.EQUIPMENT_PROVIDER_ONBOARD:
        return `
          <div style="font-family: Inter, sans-serif; color: #333;">
            <h2>Welcome to ${context.platformName} ⚙️</h2>
            <p>Hi ${context.providerName},</p>
            <p>Your equipment provider profile has been added successfully.</p>
            <p>Here are your login credentials:</p>
            <div style="background:#f3f8ff;padding:12px;border-radius:8px;font-family:monospace;">
              <p><strong>Email:</strong> ${context.email}</p>
              <p><strong>Password:</strong> ${context.password}</p>
            </div>
            <p>Login here: <a href="${context.loginUrl}">${context.loginUrl}</a></p>
            <p>Keep your listings updated for more bookings 🚀</p>
            <hr/>
            <small style="color:#999;">© ${context.year} ${context.platformName}</small>
          </div>
        `;

      default:
        throw new Error(`Unknown email template: ${template}`);
    }
  }
}
