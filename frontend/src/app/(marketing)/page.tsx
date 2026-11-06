import { getPublicTranslator } from "@/lib/publicLocaleServer";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, Beef, Boxes, CheckCircle2, ClipboardCheck, HeartPulse, Layers3, MapPinned, Quote, ShieldCheck, Sprout, Star, Tractor, UsersRound, WalletCards, Wheat } from "lucide-react";

import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";

export async function generateMetadata(): Promise<Metadata> { const { t } = await getPublicTranslator(); return {
  title: t("public.fazendaMaisFarmManagementInOnePlace"),
  description: t("public.manageFarmsCropsHerdsStockAndFinancesWithAPlatform"),
}; }













export default async function MarketingHomePage() {
  const { t } = await getPublicTranslator();
const features = [
  { icon: Wheat, title: t("contact.agriculture"), text: t("public.planPlantingInputsOperationsAndHarvestsWithACompleteHistory") },
  { icon: Beef, title: t("public.herdManagement"), text: t("public.trackBatchesReproductionFeedingHealthAndAnimalPerformance") },
  { icon: Boxes, title: t("public.smartStockManagement"), text: t("public.keepMovementsAlertsSuppliersAndCostsUpToDate") },
  { icon: WalletCards, title: t("public.farmFinances"), text: t("public.centralizeYourOperationSIncomeExpensesAndIndicators") },
  { icon: HeartPulse, title: t("sidebar.clinic"), text: t("public.consultationsVaccinesMedicinesAndTestsIntegratedWithTheHerd") },
  { icon: BarChart3, title: t("public.clearReports"), text: t("public.turnEverydayDataIntoQuickReliableDecisions") },
];
const fieldStories = [
  {
    image: "/landing-agriculture.png",
    eyebrow: t("contact.agriculture"),
    title: t("public.technologyForEveryGrowingSeason"),
    text: t("public.planningOperationsAndCostsConnectedToWhatActuallyHappensIn"),
    href: "/gestao-agricola",
  },
  {
    image: "/landing-livestock.png",
    eyebrow: t("public.livestockManagement"),
    title: t("public.aClearerViewOfTheWholeHerd"),
    text: t("public.managementHealthFeedingAndPerformanceTogetherForMoreConfidentDecisions"),
    href: "/gestao-pecuaria",
  },
  {
    image: "/landing-multifarm.png",
    eyebrow: t("public.integratedView"),
    title: t("public.anOverviewOfTheEntireOperation"),
    text: t("public.compareUnitsCentralizeInformationAndMonitorMultipleFarmsWithoutLosing"),
    href: "/gestao-multifazendas",
  },
];
const audiences = [
  { icon: Tractor, title: t("public.farmersAndProperties"), text: t("public.organizePropertyRoutinesAndTrackCostsStockAndProductionWithout") },
  { icon: UsersRound, title: t("public.fieldTeams"), text: t("public.assignResponsibilitiesAndKeepInformationAccessibleToThoseDoingAnd") },
  { icon: MapPinned, title: t("public.multiFarmOperations"), text: t("public.getAConsolidatedViewWhileRetainingIndividualMonitoringOfEach") },
];
const testimonials = [
  { quote: t("public.nowICanTrackTheFarmSStockCostsAnd"), name: "Carlos Menezes", role: t("public.farmer"), initials: "CM" },
  { quote: t("public.theTeamStartedRecordingDailyWorkInOnePlaceThat"), name: "Mariana Lopes", role: t("public.operationsManager"), initials: "ML" },
  { quote: t("public.connectingTheFinancialOverviewToProductionMadePlanningMuchClearer"), name: "Rafael Andrade", role: t("public.farmAdministrator"), initials: "RA" },
];
const productViews = [
  { image:"/images/crops/financial-summary.png", title:t("public.financesConnectedToProduction"), text:t("public.trackCostsAndResultsInTheContextOfEachActivity") },
  { image:"/images/crops/reports-wide.png", title:t("public.reportsForDecisionMaking"), text:t("public.turnOperationalRecordsIntoAClearActionableView") },
  { image:"/images/crops/sector-structure-wide.png", title:t("public.propertyInfrastructure"), text:t("public.organizeFarmAreasSectorsAndResourcesInOneEnvironment") },
];
const faqs = [
  [t("public.doINeedToInstallAnySoftware"), t("public.noFazendaMaisIsAccessedThroughABrowserAndWorks")],
  [t("public.canIRegisterMoreThanOneFarm"), t("public.yesTheAvailableNumberDependsOnYourPlanAndCan")],
  [t("public.canMyTeamHaveDifferentAccessLevels"), t("public.yesEachUserHasARoleWithPermissionsSuitedTo")],
  [t("public.canITryItBeforeSubscribing"), t("public.plansWithATrialPeriodShowThisInThePricing")],
  [t("public.doTheModulesWorkTogether"), t("public.yesStockProductionHerdsFinancesAndReportsShareTheSame")],
];
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"SoftwareApplication",name:"Fazenda Mais",applicationCategory:"BusinessApplication",operatingSystem:"Web",description:t("public.aFarmManagementPlatformForFarmsProductionHerdsStockAnd"),url:"/planos"})}} />
    <MarketingHeader />
    <main>
      <section className="marketing-hero">
        <div className="marketing-container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><Sprout size={16} /> {t("public.simpleIntegratedFarmManagement")}</div>
            <h1>{t("public.moreControlInTheField")} <span>{t("public.betterResults")}</span> {t("public.forYourOperation")}</h1>
            <p>{t("public.farmsProductionHerdsStockAndFinancesConnectedInOnePlatform")}</p>
            <div className="hero-actions"><Link href="/contato" className="marketing-button primary">{t("requestDemo")} <ArrowRight size={18} /></Link><Link href="/recursos" className="marketing-button secondary">{t("public.exploreFeatures")}</Link></div>
            <div className="hero-proof"><span><CheckCircle2 size={17} /> {t("public.assistedImplementation")}</span><span><CheckCircle2 size={17} /> {t("public.specialistSupport")}</span><span><CheckCircle2 size={17} /> {t("public.protectedData")}</span></div>
          </div>
          <div className="hero-visual">
            <Image src="/login-farm-hero.png" alt={t("public.farmerLookingOverAFarmConnectedThroughFazendaMais")} fill priority sizes="(max-width: 900px) 100vw, 46vw" />
            <div className="hero-overlay" />
            <div className="hero-floating-card top"><span>{t("public.operationOverview")}</span><strong>{t("public.realTimeIndicators")}</strong></div>
            <div className="hero-floating-card bottom"><BarChart3 size={22} /><div><span>{t("public.dataInformedDecisions")}</span><strong>{t("public.fromTheFieldToFinances")}</strong></div></div>
          </div>
        </div>
      </section>

      <section className="marketing-section" id="recursos"><div className="marketing-container"><div className="section-heading"><div className="eyebrow">{t("public.onePlatformTheWholeOperation")}</div><h2>{t("public.completeManagementThatStaysSimple")}</h2><p>{t("public.organizedInformationForYourTeamToWorkBetterAndFor")}</p></div><div className="feature-grid">{features.map(({icon:Icon,title,text})=><article className="feature-card" key={title}><div className="feature-icon"><Icon size={22}/></div><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>

      <section className="field-stories-section">
        <div className="marketing-container">
          <div className="section-heading left field-stories-heading"><div className="eyebrow">{t("public.builtForRealFarmingConditions")}</div><h2>{t("public.aCompleteViewOfEveryPartOfTheOperation")}</h2><p>{t("public.fromCropsToHerdsFazendaMaisTurnsProductionRoutinesInto")}</p></div>
          <div className="field-stories-grid">
            {fieldStories.map((story, index)=><Link href={story.href} className={`field-story-card ${index === 0 ? "featured" : ""}`} key={story.title}>
              <Image src={story.image} alt={story.title} fill sizes={index === 0 ? "(max-width: 900px) 100vw, 58vw" : "(max-width: 900px) 100vw, 29vw"}/>
              <span className="field-story-shade" />
              <div className="field-story-copy"><small>{story.eyebrow}</small><h3>{story.title}</h3><p>{story.text}</p><span className="field-story-link">{t("public.exploreSolution")} <ArrowRight size={17}/></span></div>
            </Link>)}
          </div>
        </div>
      </section>

      <section className="workflow-section"><div className="marketing-container"><div className="section-heading left"><div className="eyebrow">{t("public.fromRegistrationToDecisions")}</div><h2>{t("public.aSimpleRoutineToKeepManagementUpToDate")}</h2><p>{t("public.fazendaMaisFollowsRealOperationalWorkflowsTurningEverydayRecordsInto")}</p></div><div className="workflow-grid"><article><span>01</span><div className="workflow-icon"><Layers3 size={23}/></div><h3>{t("public.setUpYourOperation")}</h3><p>{t("public.registerYourOrganizationFarmsTeamInfrastructureHerdsAndProductionAreas")}</p></article><article><span>02</span><div className="workflow-icon"><ClipboardCheck size={23}/></div><h3>{t("public.recordWhatHappens")}</h3><p>{t("public.centralizeMovementsManagementOperationsCostsTasksPurchasesAndFieldActivities")}</p></article><article><span>03</span><div className="workflow-icon"><BarChart3 size={23}/></div><h3>{t("public.monitorAndDecide")}</h3><p>{t("public.useIndicatorsAndReportsToIdentifyDeviationsOpportunitiesAndPriorities")}</p></article></div></div></section>

      <section className="results-section"><div className="marketing-container results-grid"><div><div className="eyebrow light">{t("public.connectedOperation")}</div><h2>{t("public.fewerSpreadsheetsMoreTraceability")}</h2><p>{t("public.fazendaMaisBringsTogetherThePropertySOperationalAndFinancial")}</p><Link href="/recursos" className="text-link">{t("public.seeEverythingYouCanManage")} <ArrowRight size={17}/></Link></div><div className="results-list"><div><strong>01</strong><span><b>{t("public.centralize")}</b> {t("public.dataFromTheWholeFarm")}</span></div><div><strong>02</strong><span><b>{t("public.track")}</b> {t("public.costsAndProductivity")}</span></div><div><strong>03</strong><span><b>{t("public.decide")}</b> {t("public.withReliableIndicators")}</span></div></div></div></section>

      <section className="marketing-section product-tour"><div className="marketing-container"><div className="section-heading"><div className="eyebrow">{t("public.takeALookInsideFazendaMais")}</div><h2>{t("public.fromFieldRoutinesToManagementInsights")}</h2><p>{t("public.productScreensConnectingOperationsInfrastructureAndResults")}</p></div><div className="product-tour-grid">{productViews.map((view)=><article key={view.title}><div className="product-shot"><Image src={view.image} alt={view.title} fill sizes="(max-width: 900px) 100vw, 33vw"/></div><h3>{view.title}</h3><p>{view.text}</p></article>)}</div></div></section>

      <section className="marketing-section audience-section"><div className="marketing-container"><div className="section-heading"><div className="eyebrow">{t("public.builtForThePeopleRunningTheOperation")}</div><h2>{t("public.fromTheFieldToStrategicManagement")}</h2><p>{t("public.anExperienceForDifferentLevelsOfResponsibilityWithoutComplicatingThe")}</p></div><div className="audience-grid">{audiences.map(({icon:Icon,title,text})=><article key={title}><Icon size={28}/><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>

      <section className="marketing-section plan-calculator-cta" id="planos"><div className="marketing-container"><div className="final-cta-card"><div><div className="eyebrow light">{t("public.aTailoredPlan")}</div><h2>{t("public.calculateTheIdealPlanForYourOperation")}</h2><p>{t("public.chooseSegmentsEnterEachActivitySSizeAndSeeThe")}</p></div><Link href="/planos" className="marketing-button light">{t("public.calculateMyPlan")} <ArrowRight size={18}/></Link></div></div></section>

      <section className="marketing-section testimonials-section"><div className="marketing-container"><div className="section-heading"><div className="eyebrow">{t("public.experienceFromTheField")}</div><h2>{t("public.moreClarityToRunTheOperation")}</h2><p>{t("public.seeHowConnectedManagementTransformsDailyWorkForFarmersAnd")}</p></div><div className="testimonials-grid">{testimonials.map((testimonial)=><article className="testimonial-card" key={testimonial.name}><div className="testimonial-top"><div className="testimonial-stars" aria-label={t("public.5OutOf5Stars")}>{Array.from({length:5}).map((_,index)=><Star key={index} size={15} fill="currentColor" />)}</div><Quote size={28}/></div><blockquote>“{testimonial.quote}”</blockquote><div className="testimonial-author"><span>{testimonial.initials}</span><div><strong>{testimonial.name}</strong><small>{testimonial.role}</small></div></div></article>)}</div></div></section>

      <section className="security-section"><div className="marketing-container security-card"><div className="security-icon"><ShieldCheck size={30}/></div><div><h2>{t("public.yourDataProtectedYourTeamInControl")}</h2><p>{t("public.separateOrganizationEnvironmentsRolePermissionsAuditingAndControlledAdministrativeAccess")}</p></div><Link href="/contato" className="marketing-button light">{t("public.talkToASpecialist")}</Link></div></section>

      <section className="marketing-section faq-section"><div className="marketing-container faq-grid"><div><div className="eyebrow">{t("public.frequentlyAskedQuestions")}</div><h2>{t("public.beforeYouStart")}</h2><p>{t("public.quickAnswersAboutAccessImplementationAndUsingThePlatform")}</p><Link href="/contato" className="text-link">{t("public.stillHaveQuestionsContactUs")} <ArrowRight size={17}/></Link></div><div className="faq-list">{faqs.map(([question,answer])=><details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></div></section>

      <section className="final-cta"><div className="marketing-container final-cta-card"><div><div className="eyebrow light">{t("public.readyToOrganizeYourOperation")}</div><h2>{t("public.bringMoreClarityToEveryFieldDecision")}</h2><p>{t("public.exploreFazendaMaisInADemoTailoredToYourProperty")}</p></div><div className="final-cta-actions"><Link href="/contato" className="marketing-button light">{t("requestDemo")} <ArrowRight size={18}/></Link><Link href="/planos" className="marketing-button outline-light">{t("public.viewPlans")}</Link></div></div></section>
    </main>
    <MarketingFooter />
  </>;
}
