import { EmailTemplate } from 'src/common/enums/mail-templates.enum';

export class EmailTemplateResolver {
  private static getArtisticEmailTemplate(
    title: string,
    content: string,
    buttonUrl?: string,
    buttonText?: string,
  ): string {
    return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
 <head>
  <meta charset="UTF-8">
  <meta content="width=device-width, initial-scale=1" name="viewport">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta content="telephone=no" name="format-detection">
  <title>Artistic Platform</title>
  <style type="text/css">
.rollover:hover .rollover-first {
  max-height:0px!important;
  display:none!important;
}
.rollover:hover .rollover-second {
  max-height:none!important;
  display:block!important;
}
.rollover span {
  font-size:0px;
}
u + .body img ~ div div {
  display:none;
}
#outlook a {
  padding:0;
}
span.MsoHyperlink,
span.MsoHyperlinkFollowed {
  color:inherit;
  mso-style-priority:99;
}
a.es-button {
  mso-style-priority:100!important;
  text-decoration:none!important;
}
a[x-apple-data-detectors],
#MessageViewBody a {
  color:inherit!important;
  text-decoration:none!important;
  font-size:inherit!important;
  font-family:inherit!important;
  font-weight:inherit!important;
  line-height:inherit!important;
}
.es-desk-hidden {
  display:none;
  float:left;
  overflow:hidden;
  width:0;
  max-height:0;
  line-height:0;
  mso-hide:all;
}
@media only screen and (max-width:600px) {.es-m-p0r { padding-right:0px!important } .es-m-p0l { padding-left:0px!important } .es-p-default { } *[class="gmail-fix"] { display:none!important } p, a { line-height:150%!important } h1, h1 a { line-height:120%!important } h2, h2 a { line-height:120%!important } h3, h3 a { line-height:120%!important } h4, h4 a { line-height:120%!important } h5, h5 a { line-height:120%!important } h6, h6 a { line-height:120%!important } .es-header-body p { } .es-content-body p { } .es-footer-body p { } .es-infoblock p { } h1 { font-size:36px!important; text-align:left } h2 { font-size:26px!important; text-align:left } h3 { font-size:20px!important; text-align:left } h4 { font-size:24px!important; text-align:left } h5 { font-size:20px!important; text-align:left } h6 { font-size:16px!important; text-align:left } .es-header-body h1 a, .es-content-body h1 a, .es-footer-body h1 a { font-size:36px!important } .es-header-body h2 a, .es-content-body h2 a, .es-footer-body h2 a { font-size:26px!important } .es-header-body h3 a, .es-content-body h3 a, .es-footer-body h3 a { font-size:20px!important } .es-header-body h4 a, .es-content-body h4 a, .es-footer-body h4 a { font-size:24px!important } .es-header-body h5 a, .es-content-body h5 a, .es-footer-body h5 a { font-size:20px!important } .es-header-body h6 a, .es-content-body h6 a, .es-footer-body h6 a { font-size:16px!important } .es-menu td a { font-size:12px!important } .es-header-body p, .es-header-body a { font-size:14px!important } .es-content-body p, .es-content-body a { font-size:14px!important } .es-footer-body p, .es-footer-body a { font-size:14px!important } .es-infoblock p, .es-infoblock a { font-size:12px!important } .es-m-txt-c, .es-m-txt-c h1, .es-m-txt-c h2, .es-m-txt-c h3, .es-m-txt-c h4, .es-m-txt-c h5, .es-m-txt-c h6 { text-align:center!important } .es-m-txt-r, .es-m-txt-r h1, .es-m-txt-r h2, .es-m-txt-r h3, .es-m-txt-r h4, .es-m-txt-r h5, .es-m-txt-r h6 { text-align:right!important } .es-m-txt-j, .es-m-txt-j h1, .es-m-txt-j h2, .es-m-txt-j h3, .es-m-txt-j h4, .es-m-txt-j h5, .es-m-txt-j h6 { text-align:justify!important } .es-m-txt-l, .es-m-txt-l h1, .es-m-txt-l h2, .es-m-txt-l h3, .es-m-txt-l h4, .es-m-txt-l h5, .es-m-txt-l h6 { text-align:left!important } .es-m-txt-r img, .es-m-txt-c img, .es-m-txt-l img { display:inline!important } .es-m-txt-r .rollover:hover .rollover-second, .es-m-txt-c .rollover:hover .rollover-second, .es-m-txt-l .rollover:hover .rollover-second { display:inline!important } .es-m-txt-r .rollover span, .es-m-txt-c .rollover span, .es-m-txt-l .rollover span { line-height:0!important; font-size:0!important; display:block } .es-spacer { display:inline-table } a.es-button, button.es-button { font-size:20px!important; padding:10px 20px 10px 20px!important; line-height:120%!important } a.es-button, button.es-button, .es-button-border { display:inline-block!important } .es-m-fw, .es-m-fw.es-fw, .es-m-fw .es-button { display:block!important } .es-m-il, .es-m-il .es-button, .es-social, .es-social td, .es-menu.es-table-not-adapt { display:inline-block!important } .es-adaptive table, .es-left, .es-right { width:100%!important } .es-content table, .es-header table, .es-footer table, .es-content, .es-footer, .es-header { width:100%!important; max-width:600px!important } .adapt-img { width:100%!important; height:auto!important } .es-adapt-td { display:block!important; width:100%!important } .es-mobile-hidden, .es-hidden { display:none!important } .es-container-hidden { display:none!important } .es-desk-hidden { width:auto!important; overflow:visible!important; float:none!important; max-height:inherit!important; line-height:inherit!important } tr.es-desk-hidden { display:table-row!important } table.es-desk-hidden { display:table!important } td.es-desk-menu-hidden { display:table-cell!important } .es-menu td { width:1%!important } table.es-table-not-adapt, .esd-block-html table { width:auto!important } .h-auto { height:auto!important } }
@media screen and (max-width:384px) {.mail-message-content { width:414px!important } }
</style>
 </head>
 <body class="body" style="width:100%;height:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;padding:0;Margin:0">
  <div dir="ltr" class="es-wrapper-color" lang="en" style="background-color:#FAFAFA">
   <table width="100%" cellspacing="0" cellpadding="0" class="es-wrapper" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;padding:0;Margin:0;width:100%;height:100%;background-repeat:repeat;background-position:center top;background-color:#FAFAFA">
     <tr>
      <td valign="top" style="padding:0;Margin:0">
       <table cellpadding="0" cellspacing="0" align="center" class="es-content" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;width:100%;table-layout:fixed !important">
         <tr>
          <td align="center" style="padding:0;Margin:0">
           <table align="center" cellpadding="0" cellspacing="0" bgcolor="#00000000" class="es-content-body" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:transparent;width:600px" role="none">
             <tr>
              <td align="left" style="padding:20px;Margin:0">
               <table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                 <tr>
                  <td align="center" valign="top" style="padding:0;Margin:0;width:560px">
                   <table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                     <tr>
                      <td align="center" style="padding:0;Margin:0;display:none"></td>
                     </tr>
                   </table></td>
                 </tr>
               </table></td>
             </tr>
           </table></td>
         </tr>
       </table>
       <table cellpadding="0" cellspacing="0" align="center" class="es-header" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;width:100%;table-layout:fixed !important;background-color:transparent;background-repeat:repeat;background-position:center top">
         <tr>
          <td align="center" style="padding:0;Margin:0">
           <table bgcolor="#ffffff" align="center" cellpadding="0" cellspacing="0" class="es-header-body" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:transparent;width:600px">
             <tr>
              <td align="left" style="padding:20px;Margin:0">
               <table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                 <tr>
                  <td valign="top" align="center" class="es-m-p0r" style="padding:0;Margin:0;width:560px">
                   <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                     <tr>
                      <td align="center" style="padding:0;Margin:0;padding-bottom:10px;font-size:0px"><img src="https://myartisticbucket.s3.me-central-1.amazonaws.com/ld.png" alt="Logo" width="560" title="Logo" class="adapt-img" style="display:block;font-size:12px;border:0;outline:none;text-decoration:none;margin:0"></td>
                     </tr>
                   </table></td>
                 </tr>
               </table></td>
             </tr>
           </table></td>
         </tr>
       </table>
       <table cellpadding="0" cellspacing="0" align="center" class="es-content" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;width:100%;table-layout:fixed !important">
         <tr>
          <td align="center" style="padding:0;Margin:0">
           <table bgcolor="#ffffff" align="center" cellpadding="0" cellspacing="0" class="es-content-body" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:#FFFFFF;width:600px">
             <tr>
              <td align="left" style="padding:0;Margin:0;padding-top:15px;padding-right:20px;padding-left:20px">
               <table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                 <tr>
                  <td align="center" valign="top" style="padding:0;Margin:0;width:560px">
                   <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                     <tr>
                      <td align="center" style="padding:0;Margin:0;padding-bottom:10px;padding-top:10px;font-size:0px"><img src="https://evzvpvo.stripocdn.email/content/guids/CABINET_91d375bbb7ce4a7f7b848a611a0368a7/images/69901618385469411.png" alt="" width="100" style="display:block;font-size:14px;border:0;outline:none;text-decoration:none;margin:0"></td>
                     </tr>
                     <tr>
                      <td align="center" class="es-m-p0r es-m-p0l" style="Margin:0;padding-top:15px;padding-right:40px;padding-bottom:15px;padding-left:40px"><h1 class="es-m-txt-c" style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:46px;font-style:normal;font-weight:bold;line-height:55.2px;color:#333333">${title}</h1></td>
                     </tr>
                     <tr>
                      <td align="left" style="padding:0;Margin:0;padding-top:10px">
                        ${content}
                      </td>
                     </tr>
                   </table></td>
                 </tr>
               </table></td>
             </tr>
           </table></td>
         </tr>
       </table>
       <table cellpadding="0" cellspacing="0" align="center" class="es-footer" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;width:100%;table-layout:fixed !important;background-color:transparent;background-repeat:repeat;background-position:center top">
         <tr>
          <td align="center" style="padding:0;Margin:0">
           <table align="center" cellpadding="0" cellspacing="0" class="es-footer-body" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:transparent;width:600px" role="none">
             <tr>
              <td align="left" style="padding:0;Margin:0;padding-right:20px;padding-left:20px;padding-top:20px">
               <table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                 <tr>
                  <td align="left" style="padding:0;Margin:0;width:560px">
                   <table cellspacing="0" width="100%" cellpadding="0" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                     <tr>
                      <td align="center" style="padding:0;Margin:0;padding-top:15px;padding-bottom:15px;font-size:0">
                       <table cellpadding="0" cellspacing="0" class="es-table-not-adapt es-social" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                         <tr>
                          <td align="center" valign="top" style="padding:0;Margin:0;padding-right:40px"><a target="_blank" href="https://www.instagram.com/artistic__global/" style="mso-line-height-rule:exactly;text-decoration:underline;color:#333333;font-size:12px"><img title="Instagram" src="https://evzvpvo.stripocdn.email/content/assets/img/social-icons/logo-black/instagram-logo-black.png" alt="Inst" width="32" style="display:block;font-size:14px;border:0;outline:none;text-decoration:none;margin:0"></a></td>
                         </tr>
                       </table></td>
                     </tr>
                     <tr>
                      <td align="center" style="padding:0;Margin:0;padding-bottom:35px"><p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:18px;letter-spacing:0;color:#333333;font-size:12px">Artistic&Co.</p><p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:18px;letter-spacing:0;color:#333333;font-size:12px">info@artistic.global | www.artistic.global</p></td>
                     </tr>
                   </table></td>
                 </tr>
               </table></td>
             </tr>
           </table></td>
         </tr>
       </table>
       <table cellpadding="0" cellspacing="0" align="center" class="es-content" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;width:100%;table-layout:fixed !important">
         <tr>
          <td align="center" class="es-info-area" style="padding:0;Margin:0">
           <table align="center" cellpadding="0" cellspacing="0" bgcolor="#00000000" class="es-content-body" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:transparent;width:600px" role="none">
             <tr>
              <td align="left" style="padding:20px;Margin:0">
               <table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                 <tr>
                  <td align="center" valign="top" style="padding:0;Margin:0;width:560px">
                   <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                     <tr>
                      <td align="center" class="es-infoblock" style="padding:0;Margin:0"><p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:18px;letter-spacing:0;color:#CCCCCC;font-size:12px">No longer want to receive these emails?&nbsp;<a href="" target="_blank" style="mso-line-height-rule:exactly;text-decoration:underline;color:#CCCCCC;font-size:12px">Unsubscribe</a>.</p></td>
                     </tr>
                   </table></td>
                 </tr>
               </table></td>
             </tr>
           </table></td>
         </tr>
       </table></td>
     </tr>
   </table>
  </div>
 </body>
</html>`;
  }

  static resolve(
    template: EmailTemplate,
    context: Record<string, any>,
  ): string {
    switch (template) {
      /**
       * 🎤 Artist Onboard Template
       */
      case EmailTemplate.ARTIST_ONBOARD:
        return this.getArtisticEmailTemplate(
          `Welcome to ${context.platformName}! 🎵`,
          `
            <h2 style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">Hi ${context.firstName},</h2>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              Congratulations! Your artist profile has been successfully created on our platform. You're now part of our creative community!
            </p>
            <div style="background: #f8f9ff; border-left: 4px solid #391c71; padding: 20px; margin: 30px 0; border-radius: 4px;">
              <h3 style="color: #333; margin: 0 0 15px 0;">Your Login Credentials</h3>
              <p style="margin: 5px 0;"><strong>Email:</strong> ${context.email}</p>
              <p style="margin: 5px 0;"><strong>Password:</strong> <code style="background: #e1e5f0; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${context.password}</code></p>
            </div>
            <span class="es-button-border" style="border-style:solid;border-color:#391c71;background:#391c71;border-width:0px;display:inline-block;border-radius:6px;width:auto">
              <a href="${context.loginUrl}" target="_blank" class="es-button" style="mso-style-priority:100 !important;text-decoration:none !important;mso-line-height-rule:exactly;color:#FFFFFF;font-size:20px;padding:10px 30px 10px 30px;display:inline-block;background:#391c71;border-radius:6px;font-family:arial, 'helvetica neue', helvetica, sans-serif;font-weight:normal;font-style:normal;line-height:24px;width:auto;text-align:center;letter-spacing:0;mso-padding-alt:0;mso-border-alt:10px solid #391c71;border-left-width:30px;border-right-width:30px">LOGIN TO YOUR ACCOUNT</a>
            </span>
            <h3 class="es-m-txt-c" style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">Please change your password after first login for security.</h3>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              Ready to showcase your talent? Complete your profile, upload your best work, and start connecting with event organizers!
            </p>
          `,
        );

      /**
       * ⚙️ Equipment Provider Onboard Template
       */
      case EmailTemplate.EQUIPMENT_PROVIDER_ONBOARD:
        return this.getArtisticEmailTemplate(
          'Welcome to Artistic Platform! ⚙️',
          `
            <h2 style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">Hi ${context.fullName || context.firstName},</h2>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              Congratulations! Your equipment provider account has been successfully created. You can now start listing your equipment and connecting with event organizers.
            </p>
            <div style="background: #f0fdf4; border-left: 4px solid #391c71; padding: 20px; margin: 30px 0; border-radius: 4px;">
              <h3 style="color: #333; margin: 0 0 15px 0;">Your Login Credentials</h3>
              <p style="margin: 5px 0;"><strong>Email:</strong> ${context.email}</p>
              <p style="margin: 5px 0;"><strong>Password:</strong> <code style="background: #dcfce7; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${context.password}</code></p>
            </div>
            <span class="es-button-border" style="border-style:solid;border-color:#391c71;background:#391c71;border-width:0px;display:inline-block;border-radius:6px;width:auto">
              <a href="${context.loginUrl}" target="_blank" class="es-button" style="mso-style-priority:100 !important;text-decoration:none !important;mso-line-height-rule:exactly;color:#FFFFFF;font-size:20px;padding:10px 30px 10px 30px;display:inline-block;background:#391c71;border-radius:6px;font-family:arial, 'helvetica neue', helvetica, sans-serif;font-weight:normal;font-style:normal;line-height:24px;width:auto;text-align:center;letter-spacing:0;mso-padding-alt:0;mso-border-alt:10px solid #391c71;border-left-width:30px;border-right-width:30px">ACCESS YOUR DASHBOARD</a>
            </span>
            <h3 class="es-m-txt-c" style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">For security, please change this password after your first login.</h3>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              Our platform connects you with event organizers looking for quality equipment. The more detailed your listings, the more bookings you'll receive!
            </p>
          `,
        );

      /**
       * 🏢 Venue Provider Onboard Template
       */
      case EmailTemplate.VENUE_PROVIDER_ONBOARD:
        return this.getArtisticEmailTemplate(
          'Welcome to Artistic Platform! 🏢',
          `
            <h2 style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">Hi ${context.fullName || context.firstName},</h2>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              Congratulations! Your venue provider account has been successfully created. You can now start listing your venues and connecting with event organizers.
            </p>
            <div style="background: #fef3e2; border-left: 4px solid #391c71; padding: 20px; margin: 30px 0; border-radius: 4px;">
              <h3 style="color: #333; margin: 0 0 15px 0;">Your Login Credentials</h3>
              <p style="margin: 5px 0;"><strong>Email:</strong> ${context.email}</p>
              <p style="margin: 5px 0;"><strong>Password:</strong> <code style="background: #fef3e2; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${context.password}</code></p>
              ${context.category ? `<p style="margin: 5px 0;"><strong>Venue Category:</strong> ${context.category}</p>` : ''}
              ${context.address ? `<p style="margin: 5px 0;"><strong>Location:</strong> ${context.address}</p>` : ''}
            </div>
            <span class="es-button-border" style="border-style:solid;border-color:#391c71;background:#391c71;border-width:0px;display:inline-block;border-radius:6px;width:auto">
              <a href="${context.loginUrl}" target="_blank" class="es-button" style="mso-style-priority:100 !important;text-decoration:none !important;mso-line-height-rule:exactly;color:#FFFFFF;font-size:20px;padding:10px 30px 10px 30px;display:inline-block;background:#391c71;border-radius:6px;font-family:arial, 'helvetica neue', helvetica, sans-serif;font-weight:normal;font-style:normal;line-height:24px;width:auto;text-align:center;letter-spacing:0;mso-padding-alt:0;mso-border-alt:10px solid #391c71;border-left-width:30px;border-right-width:30px">ACCESS YOUR DASHBOARD</a>
            </span>
            <h3 class="es-m-txt-c" style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">For security, please change this password after your first login.</h3>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              Our platform connects you with event organizers looking for the perfect venues. Complete your venue listings with detailed descriptions and high-quality photos to attract more bookings!
            </p>
          `,
        );

      /**
       * 🪩 Artist Profile Updated Template
       */
      case EmailTemplate.ARTIST_PROFILE_UPDATED:
        return this.getArtisticEmailTemplate(
          'Profile Updated Successfully ✅',
          `
            <h2 style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">Hi ${context.artistName || context.firstName},</h2>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              Great news! Your artist profile has been successfully updated on Artistic Platform.
            </p>
            <span class="es-button-border" style="border-style:solid;border-color:#391c71;background:#391c71;border-width:0px;display:inline-block;border-radius:6px;width:auto">
              <a href="${context.profileUrl || context.loginUrl}" target="_blank" class="es-button" style="mso-style-priority:100 !important;text-decoration:none !important;mso-line-height-rule:exactly;color:#FFFFFF;font-size:20px;padding:10px 30px 10px 30px;display:inline-block;background:#391c71;border-radius:6px;font-family:arial, 'helvetica neue', helvetica, sans-serif;font-weight:normal;font-style:normal;line-height:24px;width:auto;text-align:center;letter-spacing:0;mso-padding-alt:0;mso-border-alt:10px solid #391c71;border-left-width:30px;border-right-width:30px">VIEW YOUR PROFILE</a>
            </span>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              Keep your profile updated to attract more event organizers and booking opportunities!
            </p>
          `,
        );

      /**
       * 🔐 OTP Verification Template
       */
      case EmailTemplate.OTP_VERIFICATION:
        return this.getArtisticEmailTemplate(
          'Email Verification 🔐',
          `
            <h2 style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">Verify Your Email Address</h2>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              Please use the verification code below to verify your email address:
            </p>
            <div style="background: #f0f9ff; border: 2px solid #391c71; border-radius: 12px; padding: 30px; margin: 30px 0; text-align: center;">
              <div style="font-size: 36px; font-weight: bold; color: #391c71; letter-spacing: 8px; font-family: monospace;">
                ${context.otp || context.code}
              </div>
            </div>
            <h3 class="es-m-txt-c" style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">This code expires in ${context.expiryMinutes || '10'} minutes.</h3>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              If you didn't request this verification, please ignore this email.
            </p>
          `,
        );

      /**
       * 🔄 Password Reset Template
       */
      case EmailTemplate.PASSWORD_RESET:
        return this.getArtisticEmailTemplate(
          'Password reset',
          `
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">After you click the button, you'll be asked to complete the following steps:</p>
            <ol style="font-family:arial, 'helvetica neue', helvetica, sans-serif;padding:0px 0px 0px 40px;margin-top:15px;margin-bottom:15px">
              <li style="color:#333333;margin:0px 0px 15px;font-size:14px">Enter a new password.</li>
              <li style="color:#333333;margin:0px 0px 15px;font-size:14px">Confirm your new password.</li>
              <li style="color:#333333;margin:0px 0px 15px;font-size:14px">Click Submit.</li>
            </ol>
            <span class="es-button-border" style="border-style:solid;border-color:#391c71;background:#391c71;border-width:0px;display:inline-block;border-radius:6px;width:auto">
              <a href="${context.resetUrl}" target="_blank" class="es-button" style="mso-style-priority:100 !important;text-decoration:none !important;mso-line-height-rule:exactly;color:#FFFFFF;font-size:20px;padding:10px 30px 10px 30px;display:inline-block;background:#391c71;border-radius:6px;font-family:arial, 'helvetica neue', helvetica, sans-serif;font-weight:normal;font-style:normal;line-height:24px;width:auto;text-align:center;letter-spacing:0;mso-padding-alt:0;mso-border-alt:10px solid #391c71;border-left-width:30px;border-right-width:30px">RESET YOUR PASSWORD</a>
            </span>
            <h3 class="es-m-txt-c" style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">This link is valid for one use only. Expires in ${context.expiryMinutes || '30'} minutes.</h3>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              If you didn't request to reset your password, please disregard this message or contact our customer service department.
            </p>
          `,
        );

      /**
       * 🔒 Password Change OTP Template
       */
      case EmailTemplate.PASSWORD_CHANGE_OTP:
        return this.getArtisticEmailTemplate(
          'Password Change Request 🔒',
          `
            <h2 style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">Hi ${context.firstName},</h2>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              You've requested to change your password. Please use the verification code below to proceed:
            </p>
            <div style="background: #fef3c7; border: 2px solid #391c71; border-radius: 12px; padding: 30px; margin: 30px 0; text-align: center;">
              <div style="font-size: 36px; font-weight: bold; color: #391c71; letter-spacing: 8px; font-family: monospace;">
                ${context.otp}
              </div>
            </div>
            <h3 class="es-m-txt-c" style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">This code expires in ${context.validMinutes} minutes.</h3>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              If you didn't request this password change, please ignore this email and your password will remain unchanged.
            </p>
          `,
        );

      /**
       * ✅ Password Change Confirmation Template
       */
      case EmailTemplate.PASSWORD_CHANGE_CONFIRMATION:
        return this.getArtisticEmailTemplate(
          'Password Changed Successfully ✅',
          `
            <h2 style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">Hi ${context.firstName},</h2>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              Your password has been successfully changed for your Artistic Platform account.
            </p>
            <div style="background: #dcfce7; border-radius: 12px; padding: 30px; margin: 30px 0; text-align: center;">
              <div style="font-size: 48px; margin-bottom: 15px;">🔐</div>
              <h3 style="color: #391c71; margin: 0;">Password Updated</h3>
              <p style="color: #047857; margin: 10px 0 0 0; font-size: 14px;">
                ${new Date().toLocaleString()}
              </p>
            </div>
            <h3 class="es-m-txt-c" style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">If you didn't make this change, contact support immediately.</h3>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              If you didn't make this change, please contact our support team immediately at support@artistic.global
            </p>
          `,
        );

      /**
       * 🎟️ Booking Confirmation Template
       */
      case EmailTemplate.BOOKING_CONFIRMATION:
        return this.getArtisticEmailTemplate(
          'Booking Confirmed! 🎟️',
          `
            <h2 style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">Hi ${context.customerName || context.firstName},</h2>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              Great news! Your booking has been confirmed. Here are the details:
            </p>
            <div style="background: #f0fdf4; border-left: 4px solid #391c71; padding: 20px; margin: 30px 0; border-radius: 4px;">
              <h3 style="color: #333; margin: 0 0 15px 0;">Booking Details</h3>
              <p style="margin: 5px 0;"><strong>Booking ID:</strong> ${context.bookingId}</p>
              <p style="margin: 5px 0;"><strong>Service:</strong> ${context.serviceName}</p>
              <p style="margin: 5px 0;"><strong>Date:</strong> ${context.bookingDate}</p>
              <p style="margin: 5px 0;"><strong>Time:</strong> ${context.bookingTime}</p>
              <p style="margin: 5px 0;"><strong>Duration:</strong> ${context.duration}</p>
              <p style="margin: 5px 0;"><strong>Total Amount:</strong> ${context.totalAmount}</p>
            </div>
            <span class="es-button-border" style="border-style:solid;border-color:#391c71;background:#391c71;border-width:0px;display:inline-block;border-radius:6px;width:auto">
              <a href="${context.bookingUrl}" target="_blank" class="es-button" style="mso-style-priority:100 !important;text-decoration:none !important;mso-line-height-rule:exactly;color:#FFFFFF;font-size:20px;padding:10px 30px 10px 30px;display:inline-block;background:#391c71;border-radius:6px;font-family:arial, 'helvetica neue', helvetica, sans-serif;font-weight:normal;font-style:normal;line-height:24px;width:auto;text-align:center;letter-spacing:0;mso-padding-alt:0;mso-border-alt:10px solid #391c71;border-left-width:30px;border-right-width:30px">VIEW BOOKING DETAILS</a>
            </span>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              We're excited to serve you! If you have any questions, please don't hesitate to contact us.
            </p>
          `,
        );

      /**
       * ❌ Booking Cancelled Template
       */
      case EmailTemplate.BOOKING_CANCELLED:
        return this.getArtisticEmailTemplate(
          'Booking Cancelled ❌',
          `
            <h2 style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-style:normal;font-weight:bold;line-height:30px;color:#333333">Hi ${context.customerName || context.firstName},</h2>
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              We're writing to inform you that your booking has been cancelled.
            </p>
            <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 30px 0; border-radius: 4px;">
              <h3 style="color: #333; margin: 0 0 15px 0;">Cancelled Booking Details</h3>
              <p style="margin: 5px 0;"><strong>Booking ID:</strong> ${context.bookingId}</p>
              <p style="margin: 5px 0;"><strong>Service:</strong> ${context.serviceName}</p>
              <p style="margin: 5px 0;"><strong>Original Date:</strong> ${context.bookingDate}</p>
              <p style="margin: 5px 0;"><strong>Cancellation Reason:</strong> ${context.cancellationReason || 'Not specified'}</p>
            </div>
            ${
              context.refundAmount
                ? `
            <div style="background: #f0fdf4; border-left: 4px solid #391c71; padding: 20px; margin: 30px 0; border-radius: 4px;">
              <p style="margin: 0;"><strong>Refund Amount:</strong> ${context.refundAmount}</p>
              <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">Refund will be processed within ${context.refundDays || '5-7'} business days.</p>
            </div>
            `
                : ''
            }
            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:21px;letter-spacing:0;color:#333333;font-size:14px">
              We apologize for any inconvenience this may cause. If you have any questions about this cancellation, please contact our support team.
            </p>
          `,
        );

      case EmailTemplate.ADMIN_ONBOARD:
        return this.getArtisticEmailTemplate(
          'ADMIN ONBOARDING',
          `
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;">
  <tr>
    <td align="center" style="padding: 24px;">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:6px;padding:28px;">
        <tr>
          <td style="padding-bottom:18px;">
            <h2 style="Margin:0;font-family:arial, 'helvetica neue', helvetica, sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:20px;font-weight:bold;line-height:30px;color:#333333">
              Hi ${context.firstName},
            </h2>
          </td>
        </tr>

        <tr>
          <td style="padding-bottom:16px;">
            <p style="Margin:0;font-size:14px;line-height:21px;color:#333333;">
              Good news — <strong>Artistric</strong> has added you as an <strong>Administrator</strong> on our platform. Welcome aboard!
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 0 22px 0;">
            <div style="background:#f8f9ff;border-left:4px solid #391c71;padding:20px;margin:20px 0;border-radius:4px;">
              <h3 style="color:#333;margin:0 0 12px 0;font-size:16px;">Your Admin Login Credentials</h3>
              <p style="margin:6px 0;font-size:14px;"><strong>Email:</strong> ${context.email}</p>
              <p style="margin:6px 0;font-size:14px;"><strong>Password:</strong>
                <code style="background:#e1e5f0;padding:4px 8px;border-radius:4px;font-family:monospace;">${context.password}</code>
              </p>
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding-bottom:20px;">
            <span style="display:inline-block;border-radius:6px;background:#391c71;">
              <a href="https://artistic.global/auth/signin" target="_blank" style="text-decoration:none;color:#ffffff;font-size:18px;padding:10px 28px;display:inline-block;border-radius:6px;font-family:arial, 'helvetica neue', helvetica, sans-serif;line-height:22px;">
                LOGIN TO DASHBOARD
              </a>
            </span>
          </td>
        </tr>

        <tr>
          <td style="padding-bottom:12px;">
            <h3 style="Margin:0;font-size:16px;color:#333333;">Important</h3>
            <p style="Margin:6px 0 0 0;font-size:14px;color:#333333;line-height:21px;">
              For security, please change your password after first login and enable two-factor authentication from your account settings.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding-top:18px;padding-bottom:6px;">
            <p style="Margin:0;font-size:14px;line-height:21px;color:#333333;">
              Need help or want to get started with admin tasks? Visit the <a href="https://artistic.global/auth/signin" target="_blank" style="color:#391c71;text-decoration:none;">Admin Dashboard</a> or contact our support team.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding-top:22px;border-top:1px solid #eeeeee;">
            <p style="Margin:0;font-size:12px;color:#777777;">— The Artistric Team</p>
            <p style="Margin:6px 0 0 0;font-size:12px;color:#999999;">If you didn't expect this email, please contact support immediately.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`,
        );
      default:
        throw new Error(`Unknown email template: ${template}`);
    }
  }
}
