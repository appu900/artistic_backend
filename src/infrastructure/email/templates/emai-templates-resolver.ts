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
          <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">Welcome to ${context.platformName}! 🎵</h1>
            </div>
            
            <div style="padding: 40px 20px;">
              <h2 style="color: #333; margin-bottom: 20px;">Hi ${context.firstName},</h2>
              
              <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                Congratulations! Your artist profile has been successfully created on our platform. 
                You're now part of our creative community!
              </p>
              
              <div style="background: #f8f9ff; border-left: 4px solid #667eea; padding: 20px; margin: 30px 0; border-radius: 4px;">
                <h3 style="color: #333; margin: 0 0 15px 0;">Your Login Credentials</h3>
                <p style="margin: 5px 0;"><strong>Email:</strong> ${context.email}</p>
                <p style="margin: 5px 0;"><strong>Password:</strong> <code style="background: #e1e5f0; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${context.password}</code></p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${context.loginUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Login to Your Account
                </a>
              </div>
              
              <div style="background: #fff9e6; border: 1px solid #ffd700; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <h4 style="color: #b8860b; margin: 0 0 10px 0;">🔒 Security Notice</h4>
                <p style="color: #b8860b; margin: 0; font-size: 14px;">
                  Please change your password after your first login for security purposes.
                </p>
              </div>
              
              <p style="color: #666; line-height: 1.6;">
                Ready to showcase your talent? Complete your profile, upload your best work, and start connecting with event organizers!
              </p>
              
              <p style="color: #666; line-height: 1.6; margin-top: 30px;">
                Best regards,<br/>
                The ${context.platformName} Team
              </p>
            </div>
            
            <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                © ${context.year} ${context.platformName}. All rights reserved.
              </p>
            </div>
          </div>
        `;

      /**
       * ⚙️ Equipment Provider Onboard Template
       */
      case EmailTemplate.EQUIPMENT_PROVIDER_ONBOARD:
        return `
          <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">Welcome to ${context.platformName}! ⚙️</h1>
            </div>
            
            <div style="padding: 40px 20px;">
              <h2 style="color: #333; margin-bottom: 20px;">Hi ${context.fullName || context.firstName},</h2>
              
              <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                Congratulations! Your equipment provider account has been successfully created. 
                You can now start listing your equipment and connecting with event organizers who need your services.
              </p>
              
              <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 30px 0; border-radius: 4px;">
                <h3 style="color: #333; margin: 0 0 15px 0;">Your Login Credentials</h3>
                <p style="margin: 5px 0;"><strong>Email:</strong> ${context.email}</p>
                <p style="margin: 5px 0;"><strong>Password:</strong> <code style="background: #dcfce7; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${context.password}</code></p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${context.loginUrl}" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Access Your Dashboard
                </a>
              </div>
              
              <div style="background: #fff9e6; border: 1px solid #ffd700; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <h4 style="color: #b8860b; margin: 0 0 10px 0;">🔒 Security Notice</h4>
                <p style="color: #b8860b; margin: 0; font-size: 14px;">
                  For your security, please change this password after your first login.
                </p>
              </div>
              
              <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <h4 style="color: #333; margin: 0 0 15px 0;">🚀 Next Steps</h4>
                <ul style="color: #666; margin: 0; padding-left: 20px;">
                  <li style="margin: 8px 0;">Complete your company profile</li>
                  <li style="margin: 8px 0;">Add your first equipment listing</li>
                  <li style="margin: 8px 0;">Upload high-quality images of your equipment</li>
                  <li style="margin: 8px 0;">Set competitive pricing for better bookings</li>
                  <li style="margin: 8px 0;">Keep your availability calendar updated</li>
                </ul>
              </div>
              
              <p style="color: #666; line-height: 1.6;">
                Our platform connects you with event organizers looking for quality equipment. 
                The more detailed your listings, the more bookings you'll receive!
              </p>
              
              <p style="color: #666; line-height: 1.6; margin-top: 30px;">
                Best regards,<br/>
                The ${context.platformName} Team
              </p>
            </div>
            
            <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                © ${context.year} ${context.platformName}. All rights reserved.
              </p>
            </div>
          </div>
        `;

      /**
       * 🪩 Artist Profile Updated Template
       */
      case EmailTemplate.ARTIST_PROFILE_UPDATED:
        return `
          <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">Profile Updated Successfully ✅</h1>
            </div>
            
            <div style="padding: 40px 20px;">
              <h2 style="color: #333; margin-bottom: 20px;">Hi ${context.artistName || context.firstName},</h2>
              
              <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                Great news! Your artist profile has been successfully updated on <strong>${context.platformName}</strong>.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${context.profileUrl || context.loginUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  View Your Profile
                </a>
              </div>
              
              <p style="color: #666; line-height: 1.6; margin-top: 30px;">
                Keep your profile updated to attract more event organizers and booking opportunities!
              </p>
              
              <p style="color: #666; line-height: 1.6; margin-top: 30px;">
                Stay creative,<br/>
                The ${context.platformName} Team
              </p>
            </div>
            
            <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                © ${context.year} ${context.platformName}. All rights reserved.
              </p>
            </div>
          </div>
        `;

      /**
       * 🔐 OTP Verification Template
       */
      case EmailTemplate.OTP_VERIFICATION:
        return `
          <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">Email Verification 🔐</h1>
            </div>
            
            <div style="padding: 40px 20px; text-align: center;">
              <h2 style="color: #333; margin-bottom: 20px;">Verify Your Email Address</h2>
              
              <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
                Please use the verification code below to verify your email address:
              </p>
              
              <div style="background: #f0f9ff; border: 2px solid #3b82f6; border-radius: 12px; padding: 30px; margin: 30px 0;">
                <div style="font-size: 36px; font-weight: bold; color: #1d4ed8; letter-spacing: 8px; font-family: monospace;">
                  ${context.otp || context.code}
                </div>
              </div>
              
              <p style="color: #ef4444; font-size: 14px; margin: 20px 0;">
                This code expires in ${context.expiryMinutes || '10'} minutes.
              </p>
              
              <p style="color: #666; line-height: 1.6; font-size: 14px;">
                If you didn't request this verification, please ignore this email.
              </p>
            </div>
            
            <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                © ${context.year} ${context.platformName}. All rights reserved.
              </p>
            </div>
          </div>
        `;

      /**
       * 🔄 Password Reset Template
       */
      case EmailTemplate.PASSWORD_RESET:
        return `
          <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">Password Reset Request 🔄</h1>
            </div>
            
            <div style="padding: 40px 20px;">
              <h2 style="color: #333; margin-bottom: 20px;">Hi ${context.firstName || 'there'},</h2>
              
              <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                We received a request to reset your password for your ${context.platformName} account.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${context.resetUrl}" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  Reset Your Password
                </a>
              </div>
              
              <p style="color: #ef4444; font-size: 14px; text-align: center; margin: 20px 0;">
                This link expires in ${context.expiryMinutes || '30'} minutes.
              </p>
              
              <p style="color: #666; line-height: 1.6; font-size: 14px; margin-top: 30px;">
                If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
              </p>
              
              <p style="color: #666; line-height: 1.6; margin-top: 30px;">
                Best regards,<br/>
                The ${context.platformName} Team
              </p>
            </div>
            
            <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                © ${context.year} ${context.platformName}. All rights reserved.
              </p>
            </div>
          </div>
        `;

      /**
       * 🎟️ Booking Confirmation Template
       */
      case EmailTemplate.BOOKING_CONFIRMATION:
        return `
          <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">Booking Confirmed! 🎟️</h1>
            </div>
            
            <div style="padding: 40px 20px;">
              <h2 style="color: #333; margin-bottom: 20px;">Hi ${context.customerName || context.firstName},</h2>
              
              <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                Great news! Your booking has been confirmed. Here are the details:
              </p>
              
              <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 30px 0; border-radius: 4px;">
                <h3 style="color: #333; margin: 0 0 15px 0;">Booking Details</h3>
                <p style="margin: 5px 0;"><strong>Booking ID:</strong> ${context.bookingId}</p>
                <p style="margin: 5px 0;"><strong>Service:</strong> ${context.serviceName}</p>
                <p style="margin: 5px 0;"><strong>Date:</strong> ${context.bookingDate}</p>
                <p style="margin: 5px 0;"><strong>Time:</strong> ${context.bookingTime}</p>
                <p style="margin: 5px 0;"><strong>Duration:</strong> ${context.duration}</p>
                <p style="margin: 5px 0;"><strong>Total Amount:</strong> ${context.totalAmount}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${context.bookingUrl}" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  View Booking Details
                </a>
              </div>
              
              <p style="color: #666; line-height: 1.6;">
                We're excited to serve you! If you have any questions, please don't hesitate to contact us.
              </p>
              
              <p style="color: #666; line-height: 1.6; margin-top: 30px;">
                Best regards,<br/>
                The ${context.platformName} Team
              </p>
            </div>
            
            <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                © ${context.year} ${context.platformName}. All rights reserved.
              </p>
            </div>
          </div>
        `;

      /**
       * ❌ Booking Cancelled Template
       */
      case EmailTemplate.BOOKING_CANCELLED:
        return `
          <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">Booking Cancelled ❌</h1>
            </div>
            
            <div style="padding: 40px 20px;">
              <h2 style="color: #333; margin-bottom: 20px;">Hi ${context.customerName || context.firstName},</h2>
              
              <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                We're writing to inform you that your booking has been cancelled.
              </p>
              
              <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 30px 0; border-radius: 4px;">
                <h3 style="color: #333; margin: 0 0 15px 0;">Cancelled Booking Details</h3>
                <p style="margin: 5px 0;"><strong>Booking ID:</strong> ${context.bookingId}</p>
                <p style="margin: 5px 0;"><strong>Service:</strong> ${context.serviceName}</p>
                <p style="margin: 5px 0;"><strong>Original Date:</strong> ${context.bookingDate}</p>
                <p style="margin: 5px 0;"><strong>Cancellation Reason:</strong> ${context.cancellationReason || 'Not specified'}</p>
              </div>
              
              ${context.refundAmount ? `
              <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 30px 0; border-radius: 4px;">
                <p style="margin: 0;"><strong>Refund Amount:</strong> ${context.refundAmount}</p>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">Refund will be processed within ${context.refundDays || '5-7'} business days.</p>
              </div>
              ` : ''}
              
              <p style="color: #666; line-height: 1.6;">
                We apologize for any inconvenience this may cause. If you have any questions about this cancellation, please contact our support team.
              </p>
              
              <p style="color: #666; line-height: 1.6; margin-top: 30px;">
                Best regards,<br/>
                The ${context.platformName} Team
              </p>
            </div>
            
            <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                © ${context.year} ${context.platformName}. All rights reserved.
              </p>
            </div>
          </div>
        `;

      /**
       * 🔒 Password Change OTP Template
       */
      case EmailTemplate.PASSWORD_CHANGE_OTP:
        return `
          <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">Password Change Request 🔒</h1>
            </div>
            
            <div style="padding: 40px 20px; text-align: center;">
              <h2 style="color: #333; margin-bottom: 20px;">Hi ${context.firstName},</h2>
              
              <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
                You've requested to change your password. Please use the verification code below to proceed:
              </p>
              
              <div style="background: #fef3c7; border: 2px solid #f59e0b; border-radius: 12px; padding: 30px; margin: 30px 0;">
                <div style="font-size: 36px; font-weight: bold; color: #d97706; letter-spacing: 8px; font-family: monospace;">
                  ${context.otp}
                </div>
              </div>
              
              <p style="color: #ef4444; font-size: 14px; margin: 20px 0;">
                This code expires in ${context.validMinutes} minutes.
              </p>
              
              <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <h4 style="color: #dc2626; margin: 0 0 10px 0;">⚠️ Security Notice</h4>
                <p style="color: #dc2626; margin: 0; font-size: 14px;">
                  If you didn't request this password change, please ignore this email and your password will remain unchanged.
                </p>
              </div>
              
              <p style="color: #666; line-height: 1.6;">
                Best regards,<br/>
                The Artistic Platform Team
              </p>
            </div>
            
            <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} Artistic Platform. All rights reserved.
              </p>
            </div>
          </div>
        `;

      /**
       * ✅ Password Change Confirmation Template
       */
      case EmailTemplate.PASSWORD_CHANGE_CONFIRMATION:
        return `
          <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold;">Password Changed Successfully ✅</h1>
            </div>
            
            <div style="padding: 40px 20px; text-align: center;">
              <h2 style="color: #333; margin-bottom: 20px;">Hi ${context.firstName},</h2>
              
              <p style="color: #666; line-height: 1.6; margin-bottom: 30px;">
                Your password has been successfully changed for your Artistic Platform account.
              </p>
              
              <div style="background: #dcfce7; border-radius: 12px; padding: 30px; margin: 30px 0;">
                <div style="font-size: 48px; margin-bottom: 15px;">🔐</div>
                <h3 style="color: #059669; margin: 0;">Password Updated</h3>
                <p style="color: #047857; margin: 10px 0 0 0; font-size: 14px;">
                  ${new Date().toLocaleString()}
                </p>
              </div>
              
              <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <h4 style="color: #dc2626; margin: 0 0 10px 0;">⚠️ Security Notice</h4>
                <p style="color: #dc2626; margin: 0; font-size: 14px;">
                  If you didn't make this change, please contact our support team immediately at support@artistic.com
                </p>
              </div>
              
              <p style="color: #666; line-height: 1.6;">
                Best regards,<br/>
                The Artistic Platform Team
              </p>
            </div>
            
            <div style="background: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} Artistic Platform. All rights reserved.
              </p>
            </div>
          </div>
        `;

      default:
        throw new Error(`Unknown email template: ${template}`);
    }
  }
}