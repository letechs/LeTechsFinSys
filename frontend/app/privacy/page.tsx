'use client'

import Link from 'next/link'
import { ArrowLeft, Shield } from 'lucide-react'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-2xl font-bold text-gray-900">
              LeTechs
            </Link>
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-gray-600 hover:text-gray-900 transition-colors">
                Home
              </Link>
              <Link href="/login" className="text-primary-600 hover:text-primary-700 transition-colors">
                Login
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link
          href="/"
          className="inline-flex items-center text-primary-600 hover:text-primary-700 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Link>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 md:p-12">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Privacy Policy</h1>
              <p className="text-gray-600 mt-1">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>

          <div className="prose prose-lg max-w-none">
            <div className="space-y-8 text-gray-700 leading-relaxed">
              {/* Introduction */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Introduction</h2>
                <p>
                  LeTechs Finsys Technologies LLC ("LeTechs", "we", "us", or "our") is committed to protecting your privacy and personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our trading software services, including our copy trading platform, trading applications, automated trading systems, and related services (collectively, the "Services").
                </p>
                <p className="mt-4">
                  By using our Services, you consent to the collection and use of your information in accordance with this Privacy Policy. If you do not agree with this Privacy Policy, please do not use our Services.
                </p>
              </section>

              {/* Information We Collect */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Information We Collect</h2>
                
                <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">2.1. Information You Provide</h3>
                <p className="mb-4">We collect information that you voluntarily provide to us, including:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Account Information:</strong> Name, email address, password, and contact information</li>
                  <li><strong>Payment Information:</strong> Credit card details, billing address, and payment history (processed through secure third-party payment processors)</li>
                  <li><strong>Trading Account Information:</strong> MT4/MT5 account numbers, broker information, and trading credentials (stored securely and encrypted)</li>
                  <li><strong>Communication Data:</strong> Messages, support tickets, and other communications with us</li>
                  <li><strong>Profile Information:</strong> Preferences, settings, and subscription details</li>
                </ul>

                <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">2.2. Information Automatically Collected</h3>
                <p className="mb-4">When you use our Services, we automatically collect certain information, including:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Usage Data:</strong> Pages visited, features used, time spent, and interaction patterns</li>
                  <li><strong>Device Information:</strong> IP address, browser type, operating system, device identifiers, and mobile network information</li>
                  <li><strong>Log Data:</strong> Access times, error logs, and system performance data</li>
                  <li><strong>Cookies and Tracking Technologies:</strong> Cookies, web beacons, and similar technologies (see Section 7)</li>
                </ul>

                <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">2.3. Trading Data</h3>
                <p className="mb-4">When using our copy trading or automated trading services, we collect:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Trade execution data and history</li>
                  <li>Account balance, equity, and margin information</li>
                  <li>Trading signals and copy trading relationships</li>
                  <li>Performance metrics and statistics</li>
                </ul>
              </section>

              {/* How We Use Information */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">3. How We Use Your Information</h2>
                <p className="mb-4">We use the information we collect for the following purposes:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Service Delivery:</strong> To provide, operate, maintain, and improve our Services</li>
                  <li><strong>Account Management:</strong> To create and manage your account, process subscriptions, and handle payments</li>
                  <li><strong>Copy Trading:</strong> To facilitate trade copying between master and slave accounts</li>
                  <li><strong>Communication:</strong> To send you service-related notifications, updates, and support responses</li>
                  <li><strong>Security:</strong> To detect, prevent, and address fraud, security breaches, and unauthorized access</li>
                  <li><strong>Analytics:</strong> To analyze usage patterns, improve our Services, and develop new features</li>
                  <li><strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and legal processes</li>
                  <li><strong>Marketing:</strong> To send you promotional communications (with your consent, where required)</li>
                </ul>
              </section>

              {/* Information Sharing */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">4. How We Share Your Information</h2>
                <p className="mb-4">We do not sell your personal information. We may share your information in the following circumstances:</p>
                
                <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">4.1. Service Providers</h3>
                <p className="mb-4">We share information with trusted third-party service providers who assist us in operating our Services, including:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Payment processors (e.g., Stripe) for handling payments</li>
                  <li>Cloud hosting and storage providers</li>
                  <li>Email service providers for sending communications</li>
                  <li>Analytics and monitoring services</li>
                </ul>
                <p className="mt-4">These service providers are contractually obligated to protect your information and use it only for the purposes we specify.</p>

                <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">4.2. Legal Requirements</h3>
                <p>We may disclose your information if required by law, court order, or government regulation, or to protect our rights, property, or safety, or that of our users or others.</p>

                <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">4.3. Business Transfers</h3>
                <p>In the event of a merger, acquisition, or sale of assets, your information may be transferred to the acquiring entity, subject to the same privacy protections.</p>

                <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">4.4. With Your Consent</h3>
                <p>We may share your information with third parties when you explicitly consent to such sharing.</p>
              </section>

              {/* Data Security */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Data Security</h2>
                <p className="mb-4">
                  We implement appropriate technical and organizational security measures to protect your information from unauthorized access, disclosure, alteration, or destruction. These measures include:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Encryption of sensitive data in transit and at rest</li>
                  <li>Secure authentication and access controls</li>
                  <li>Regular security assessments and updates</li>
                  <li>Employee training on data protection</li>
                  <li>Secure payment processing through certified third-party providers</li>
                </ul>
                <p className="mt-4">
                  However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.
                </p>
              </section>

              {/* Data Retention */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Data Retention</h2>
                <p className="mb-4">
                  We retain your information for as long as necessary to provide our Services, comply with legal obligations, resolve disputes, and enforce our agreements. Specifically:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Account information is retained while your account is active and for a reasonable period after closure</li>
                  <li>Trading data may be retained for record-keeping and compliance purposes</li>
                  <li>Payment information is retained as required by financial regulations</li>
                  <li>We may retain anonymized or aggregated data indefinitely for analytics purposes</li>
                </ul>
              </section>

              {/* Cookies */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Cookies and Tracking Technologies</h2>
                <p className="mb-4">
                  We use cookies, web beacons, and similar technologies to enhance your experience, analyze usage, and personalize content. Types of cookies we use:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Essential Cookies:</strong> Required for the Services to function properly</li>
                  <li><strong>Performance Cookies:</strong> Help us understand how visitors interact with our Services</li>
                  <li><strong>Functionality Cookies:</strong> Remember your preferences and settings</li>
                  <li><strong>Marketing Cookies:</strong> Used to deliver relevant advertisements (with your consent)</li>
                </ul>
                <p className="mt-4">
                  You can control cookies through your browser settings. However, disabling certain cookies may affect the functionality of our Services.
                </p>
              </section>

              {/* Your Rights */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Your Rights and Choices</h2>
                <p className="mb-4">Depending on your location, you may have the following rights regarding your personal information:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Access:</strong> Request access to your personal information</li>
                  <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
                  <li><strong>Deletion:</strong> Request deletion of your personal information (subject to legal requirements)</li>
                  <li><strong>Portability:</strong> Request transfer of your data to another service</li>
                  <li><strong>Objection:</strong> Object to processing of your information for certain purposes</li>
                  <li><strong>Withdraw Consent:</strong> Withdraw consent where processing is based on consent</li>
                  <li><strong>Account Closure:</strong> Close your account and delete associated data (subject to retention requirements)</li>
                </ul>
                <p className="mt-4">
                  To exercise these rights, please contact us using the contact information provided in Section 11. We will respond to your request within a reasonable timeframe and in accordance with applicable law.
                </p>
              </section>

              {/* International Transfers */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">9. International Data Transfers</h2>
                <p>
                  Your information may be transferred to and processed in countries other than your country of residence. These countries may have data protection laws that differ from those in your country. We take appropriate safeguards to ensure that your information receives an adequate level of protection, including using standard contractual clauses and other legal mechanisms as required.
                </p>
              </section>

              {/* Children's Privacy */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Children's Privacy</h2>
                <p>
                  Our Services are not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected information from a child under 18, we will take steps to delete such information promptly.
                </p>
              </section>

              {/* Changes to Policy */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Changes to This Privacy Policy</h2>
                <p>
                  We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. We will notify you of material changes by email or by posting a notice on our website. The "Last updated" date at the top of this page indicates when the policy was last revised. Your continued use of the Services after such changes constitutes your acceptance of the revised Privacy Policy.
                </p>
              </section>

              {/* Contact */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Contact Us</h2>
                <p className="mb-4">
                  If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
                </p>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p><strong>LeTechs Finsys Technologies LLC</strong></p>
                  <p>Data Protection Officer</p>
                  <p>2401, Clover Bay Tower, Business Bay</p>
                  <p>Dubai, United Arab Emirates</p>
                  <p>Phone: <a href="tel:+971544569987" className="text-primary-600 hover:text-primary-700">+971 544569987</a> / <a href="tel:+971544374722" className="text-primary-600 hover:text-primary-700">+971 544374722</a></p>
                  <p>WhatsApp: <a href="https://wa.me/message/C2ERB7SZ3J5SJ1" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700">Chat with us</a></p>
                  <p>Email: <a href="mailto:privacy@letechs.io" className="text-primary-600 hover:text-primary-700">privacy@letechs.io</a></p>
                </div>
              </section>

              {/* Acknowledgment */}
              <section className="bg-primary-50 border-l-4 border-primary-600 p-4 my-8">
                <p className="font-semibold text-gray-900">
                  By using our Services, you acknowledge that you have read and understood this Privacy Policy and agree to our collection, use, and disclosure of your information as described herein.
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm">
          <p>© {new Date().getFullYear()} LeTechs Finsys Technologies LLC. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

