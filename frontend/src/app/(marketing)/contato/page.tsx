import { getPublicTranslator } from "@/lib/publicLocaleServer";
import type { Metadata } from "next";
import { Clock3, Mail, MessageCircle, Presentation } from "lucide-react";
import { ContactForm } from "@/components/marketing/ContactForm";
import { MarketingPage } from "@/components/marketing/MarketingPage";

export async function generateMetadata(): Promise<Metadata> { const { t } = await getPublicTranslator(); return {
  title: t("public.contactAndDemoFazendaMais"),
  description:
    t("public.talkToOurSalesTeamAndScheduleAFazendaMais"),
}; }

export default async function ContatoPage() {
  const { t } = await getPublicTranslator();

  return (
    <MarketingPage
      eyebrow={t("contact")}
      title={t("public.letSGetToKnowYourOperation")}
      description={t("public.shareYourChallengesChooseATimeAndDiscussYourProperty")}
    >
      <section className="marketing-section contact-section">
        <div className="marketing-container contact-layout">
          <div className="contact-copy">
            <div className="eyebrow">{t("public.requestADemo")}</div>
            <h2>{t("public.aPracticalConversationTailoredToYou")}</h2>
            <p> {t("public.yourDetailsGoDirectlyToTheFazendaMaisTeamS")} </p>
            <div className="contact-steps">
              <div>
                <span>
                  <MessageCircle size={19} />
                </span>
                <div>
                  <strong>{t("public.1TellUsAboutYourSituation")}</strong>
                  <p>{t("public.describeYourOperationAndWhatYouWantToOrganize")}</p>
                </div>
              </div>
              <div>
                <span>
                  <Presentation size={19} />
                </span>
                <div>
                  <strong>{t("public.2SeeTheWorkflowInAction")}</strong>
                  <p> {t("public.exploreTheModulesRelevantToYourChallenges")} </p>
                </div>
              </div>
              <div>
                <span>
                  <Clock3 size={19} />
                </span>
                <div>
                  <strong>{t("public.3PlanTheNextSteps")}</strong>
                  <p>{t("public.reviewThePlanImplementationAndTeamSetup")}</p>
                </div>
              </div>
            </div>
            <a className="contact-email" href="mailto:contato@agromanage.com">
              <Mail size={18} /> contato@agromanage.com
            </a>
          </div>
          <ContactForm />
        </div>
      </section>
      <section className="contact-expectations">
        <div className="marketing-container">
          <div>
            <strong>{t("public.consultativeConversation")}</strong>
            <span>{t("public.focusedOnYourRoutineAndPriorities")}</span>
          </div>
          <div>
            <strong>{t("public.tailoredDemo")}</strong>
            <span>{t("public.modulesRelevantToYou")}</span>
          </div>
          <div>
            <strong>{t("public.transparentTerms")}</strong>
            <span>{t("public.planAndLimitsClearlyExplained")}</span>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
