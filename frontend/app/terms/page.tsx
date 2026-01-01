'use client'

import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'

export default function TermsPage() {
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
              <FileText className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Terms of Service</h1>
              <p className="text-gray-600 mt-1">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>

          <div className="prose prose-lg max-w-none">
            <div className="space-y-8 text-gray-700 leading-relaxed">
              {/* Introduction */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Introduction</h2>
                <p>
                  Welcome to LeTechs Finsys Technologies LLC ("LeTechs", "we", "us", or "our"). These Terms of Service ("Terms") govern your access to and use of our trading software services, including but not limited to our copy trading platform, trading applications, automated trading systems, Expert Advisors (EAs), and related services (collectively, the "Services").
                </p>
                <p className="mt-4">
                  By accessing or using our Services, you agree to be bound by these Terms. If you do not agree to these Terms, please do not use our Services.
                </p>
              </section>

              {/* Acceptance */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Acceptance of Terms</h2>
                <p>
                  By registering for an account, accessing, or using any of our Services, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you are entering into these Terms on behalf of a company or other legal entity, you represent that you have the authority to bind such entity to these Terms.
                </p>
              </section>

              {/* Eligibility */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Eligibility and Account Registration</h2>
                <p className="mb-4">To use our Services, you must:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Be at least 18 years of age or the age of majority in your jurisdiction</li>
                  <li>Have the legal capacity to enter into binding agreements</li>
                  <li>Provide accurate, current, and complete information during registration</li>
                  <li>Maintain and promptly update your account information</li>
                  <li>Maintain the security of your account credentials</li>
                  <li>Notify us immediately of any unauthorized use of your account</li>
                </ul>
                <p className="mt-4">
                  You are responsible for all activities that occur under your account. We reserve the right to suspend or terminate accounts that violate these Terms or engage in fraudulent, illegal, or harmful activities.
                </p>
              </section>

              {/* Services Description */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Description of Services</h2>
                <p className="mb-4">LeTechs provides various trading software solutions, including:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Copy Trading System:</strong> Automated copy trading platform for MetaTrader 5 (MT5) that allows users to automatically replicate trades from master accounts to slave accounts</li>
                  <li><strong>Trading Applications:</strong> Custom trading applications and tools designed to enhance trading workflows</li>
                  <li><strong>Automated Trading Systems:</strong> Expert Advisors (EAs) and automated trading algorithms for MT4/MT5 platforms</li>
                  <li><strong>Related Services:</strong> Technical support, maintenance, and other services as described on our platform</li>
                </ul>
                <p className="mt-4">
                  We reserve the right to modify, suspend, or discontinue any aspect of our Services at any time, with or without notice.
                </p>
              </section>

              {/* Subscription and Payment */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Subscription Plans and Payment</h2>
                <p className="mb-4">Our Services are offered through various subscription plans:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Subscription fees are billed in advance according to your selected plan (monthly or yearly)</li>
                  <li>All fees are non-refundable except as required by law or as explicitly stated in these Terms</li>
                  <li>We use third-party payment processors (e.g., Stripe) to handle payments</li>
                  <li>You authorize us to charge your payment method for all subscription fees and any additional charges</li>
                  <li>Failure to pay may result in suspension or termination of your account</li>
                  <li>Prices are subject to change with notice; existing subscriptions will continue at the current rate until renewal</li>
                </ul>
              </section>

              {/* User Obligations */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">6. User Obligations and Prohibited Activities</h2>
                <p className="mb-4">You agree NOT to:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Use the Services for any illegal or unauthorized purpose</li>
                  <li>Violate any laws, regulations, or third-party rights</li>
                  <li>Attempt to gain unauthorized access to our systems or other users' accounts</li>
                  <li>Interfere with or disrupt the integrity or performance of the Services</li>
                  <li>Reverse engineer, decompile, or disassemble any part of our software</li>
                  <li>Use automated systems (bots, scrapers) to access the Services without authorization</li>
                  <li>Share your account credentials with third parties</li>
                  <li>Use the Services to transmit viruses, malware, or harmful code</li>
                  <li>Engage in any form of fraud, money laundering, or financial crime</li>
                  <li>Impersonate any person or entity or misrepresent your affiliation</li>
                </ul>
              </section>

              {/* Trading Risks */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Trading Risks and Disclaimers</h2>
                <p className="mb-4">
                  <strong>IMPORTANT RISK WARNING:</strong> Trading financial instruments, including foreign exchange, CFDs, and other derivatives, carries a high level of risk and may not be suitable for all investors. Trading involves the risk of significant financial loss.
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                  <li>Past performance does not guarantee future results</li>
                  <li>You may lose all or more than your initial investment</li>
                  <li>Leverage can work against you as well as for you</li>
                  <li>You should never trade with money you cannot afford to lose</li>
                  <li>Our Services are tools that facilitate trading; we do not provide trading advice</li>
                </ul>
                <p>
                  LeTechs provides software tools and platforms. We do not provide financial, investment, or trading advice. All trading decisions are made by you, and you are solely responsible for any trading losses or gains.
                </p>
              </section>

              {/* Intellectual Property */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Intellectual Property</h2>
                <p className="mb-4">
                  All content, software, trademarks, logos, and other intellectual property associated with our Services are owned by LeTechs Finsys Technologies LLC or our licensors. You are granted a limited, non-exclusive, non-transferable license to use our Services in accordance with these Terms.
                </p>
                <p>
                  You may not copy, modify, distribute, sell, or lease any part of our Services without our express written permission.
                </p>
              </section>

              {/* Privacy */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Privacy and Data Protection</h2>
                <p>
                  Your privacy is important to us. Our collection and use of personal information is governed by our Privacy Policy, which is incorporated into these Terms by reference. By using our Services, you consent to our collection, use, and disclosure of your information as described in our Privacy Policy.
                </p>
                <p className="mt-4">
                  <Link href="/privacy" className="text-primary-600 hover:text-primary-700 underline">
                    View our Privacy Policy
                  </Link>
                </p>
              </section>

              {/* Limitation of Liability */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Limitation of Liability</h2>
                <p className="mb-4">
                  TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, LETECHS AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                  <li>Loss of profits, data, or business opportunities</li>
                  <li>Trading losses resulting from the use of our Services</li>
                  <li>System failures, interruptions, or errors</li>
                  <li>Unauthorized access to your account or data</li>
                </ul>
                <p>
                  Our total liability to you for any claims arising from or related to the Services shall not exceed the amount you paid to us in the twelve (12) months preceding the claim.
                </p>
              </section>

              {/* Indemnification */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Indemnification</h2>
                <p>
                  You agree to indemnify, defend, and hold harmless LeTechs, its affiliates, officers, directors, employees, and agents from and against any claims, damages, losses, liabilities, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) your use of the Services, (b) your violation of these Terms, (c) your violation of any laws or regulations, or (d) your infringement of any third-party rights.
                </p>
              </section>

              {/* Termination */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Termination</h2>
                <p className="mb-4">Either party may terminate this agreement:</p>
                <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
                  <li><strong>By You:</strong> You may cancel your subscription at any time through your account settings or by contacting support</li>
                  <li><strong>By Us:</strong> We may suspend or terminate your account immediately if you violate these Terms, engage in fraudulent activity, or for any other reason at our sole discretion</li>
                </ul>
                <p>
                  Upon termination, your right to use the Services will cease immediately. We may delete your account and data, subject to our data retention policies and applicable laws.
                </p>
              </section>

              {/* Governing Law */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Governing Law and Dispute Resolution</h2>
                <p className="mb-4">
                  These Terms shall be governed by and construed in accordance with the laws of the United Arab Emirates (UAE), without regard to its conflict of law provisions.
                </p>
                <p>
                  Any disputes arising from or relating to these Terms or the Services shall be subject to the exclusive jurisdiction of the courts of Dubai, United Arab Emirates. You agree to submit to the personal jurisdiction of such courts.
                </p>
              </section>

              {/* Changes to Terms */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">14. Changes to Terms</h2>
                <p>
                  We reserve the right to modify these Terms at any time. We will notify you of material changes by email or by posting a notice on our website. Your continued use of the Services after such changes constitutes your acceptance of the revised Terms. If you do not agree to the changes, you must stop using the Services and may terminate your account.
                </p>
              </section>

              {/* Contact */}
              <section>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">15. Contact Information</h2>
                <p className="mb-4">
                  If you have any questions about these Terms, please contact us:
                </p>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p><strong>LeTechs Finsys Technologies LLC</strong></p>
                  <p>2401, Clover Bay Tower, Business Bay</p>
                  <p>Dubai, United Arab Emirates</p>
                  <p>Phone: <a href="tel:+971544569987" className="text-primary-600 hover:text-primary-700">+971 544569987</a> / <a href="tel:+971544374722" className="text-primary-600 hover:text-primary-700">+971 544374722</a></p>
                  <p>WhatsApp: <a href="https://wa.me/message/C2ERB7SZ3J5SJ1" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700">Chat with us</a></p>
                </div>
              </section>

              {/* Acknowledgment */}
              <section className="bg-primary-50 border-l-4 border-primary-600 p-4 my-8">
                <p className="font-semibold text-gray-900">
                  By using our Services, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
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

