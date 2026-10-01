// ============================================================================
//  Syed Jawaad Ali — Portfolio content
//  Single source of truth for every section rendered in App.tsx
// ============================================================================

export const profile = {
  name: "Syed Jawaad Ali",
  title: "Data, Analytics & Reporting Leader",
  tagline: "Business Intelligence · Data Governance · Financial Planning",
  location: "Karachi, Pakistan",
  email: "syedjawaadali@gmail.com",
  phone: "+92 349-2044564",
  linkedin: "https://linkedin.com/in/syedjawaadali",
  github: "https://github.com/syedjawaadali",
  site: "https://syedjawaadali.github.io/CV",
  summary:
    "Data, analytics and reporting leader with 6+ years across Banking, Telecom, Healthcare, and E-Commerce — 3+ years in managerial and team-lead positions. Holding an MS in Data Engineering & Information Management alongside a Finance & Economics foundation, I pair technical depth with the financial literacy to support planning, forecasting, and budgeting.",
  summaryLong:
    "I lead data governance and data-quality initiatives, own KPI frameworks and reporting standards, and deliver executive dashboards that give leadership a single, trusted source of institutional information. Beyond building, I mentor analysts, train teams in BI tools, and advise executives as a decision-support partner.",
};

export const stats = [
  { value: "6+", label: "Years in Data & BI" },
  { value: "100+", label: "Dashboards Shipped" },
  { value: "6", label: "Industries Served" },
  { value: "70%", label: "Reporting Time Cut" },
];

export const coreCompetencies = [
  {
    area: "Data Governance & Quality",
    detail:
      "Governance frameworks & standards, metric definitions & single-source-of-truth, data accuracy/consistency/reliability, row-level security, reconciliation & validation.",
  },
  {
    area: "Analytics & Executive Reporting",
    detail:
      "KPI frameworks & scorecards, executive dashboards, daily–quarterly reporting cadences, statistical & variance analysis, data storytelling.",
  },
  {
    area: "BI, Data Platforms & Querying",
    detail:
      "Power BI (DAX, semantic/tabular modeling, RLS, incremental refresh), Tableau, Looker Studio, Excel (Power Query/Pivot); SQL (SQL Server, MySQL, BigQuery, Snowflake), ETL/SSIS, API & JSON ingestion, Python, VBA, GCP.",
  },
  {
    area: "Financial & Business Acumen",
    detail:
      "Financial planning, forecasting & budgeting support, OPEX/cost analysis, performance analytics, business-case development.",
  },
  {
    area: "Leadership & Stakeholder Engagement",
    detail:
      "Team leadership, mentoring & formal training delivery, executive briefing & advisory, partnership with Finance and operations, UAT facilitation.",
  },
];

export const skillGroups = [
  {
    category: "BI & Visualization",
    icon: "chart",
    items: ["Power BI (DAX, RLS)", "Tableau", "Looker Studio", "Excel / Power Pivot", "Grafana"],
  },
  {
    category: "Data & Querying",
    icon: "database",
    items: ["SQL Server", "MySQL", "BigQuery", "Snowflake", "ETL / SSIS", "Power Query"],
  },
  {
    category: "Programming & Automation",
    icon: "terminal",
    items: ["Python", "SQL", "VBA / Macros", "API & JSON ingestion", "Report Automation"],
  },
  {
    category: "Platforms & Tooling",
    icon: "cpu",
    items: ["Google Cloud (GCP)", "GitHub", "Microsoft 365", "AI for Analytics", "GIS"],
  },
];

export const experienceData = [
  {
    role: "Senior BI Engineer — Consultancy Engagement",
    company: "Dolphin Insights (The Restaurant Group UK)",
    period: "Sep 2026 – Present",
    location: "Karachi, PK — UK Client Delivery",
    description: [
      "Build governed Power BI semantic models — DAX measures, row-level security by management hierarchy, incremental refresh — over a medallion/gold data layer, documenting standardized metric logic so each KPI carries one agreed definition across every report.",
      "Reconcile new reporting against legacy manual reports line-by-line until figures tie out, explaining every variance.",
      "Profile source data into source-to-target mappings and facilitate UAT with client finance and operations teams.",
    ],
  },
  {
    role: "Assistant Manager — BI Reporting, Planning & Analytics",
    company: "Telenor Pakistan",
    period: "Dec 2024 – Aug 2026",
    location: "Karachi, Pakistan",
    description: [
      "Owned and automated executive Power BI and Excel dashboards consolidating performance across products and channels into a single, trusted view.",
      "Designed KPI frameworks and reporting-governance standards for leadership decision-making.",
      "Optimized SQL-based data models for accuracy, scalability, and consistency; partnered with Finance on planning and cost analysis as a trusted analytics partner.",
    ],
  },
  {
    role: "Lead Data Analyst — Consultancy Engagement",
    company: "TGD Services DMCC",
    period: "Dec 2023 – Jul 2024",
    location: "Dubai, UAE",
    description: [
      "Led data collection, validation, and automated extraction across multiple sources (Excel, Python, MySQL) for a defined scope, ensuring accuracy and reliability of client reporting.",
      "Built automated Tableau dashboards and presented findings to stakeholders to guide decisions.",
      "Applied GIS tools for geospatial and spatial analysis to enhance visualization.",
    ],
  },
  {
    role: "Marketing Data Analyst — Contract",
    company: "DM Clinical Research",
    period: "Aug 2024 – Nov 2024",
    location: "Remote, USA",
    description: [
      "Automated reporting and dashboards for real-time, data-driven decision-making across sectors including healthcare.",
      "Analyzed clinical-trial and campaign data to drive marketing strategy, segmentation, and positioning.",
      "Monitored market and competitor trends to surface opportunities.",
    ],
  },
  {
    role: "Assistant Manager — MIS & Analytics",
    company: "Habib Bank Limited (HBL)",
    period: "Feb 2023 – Aug 2023",
    location: "Karachi, Pakistan",
    description: [
      "Built and automated MIS dashboards and daily productivity reporting for senior management across contact-centre and operations.",
      "Implemented automation frameworks for performance management and OPEX tracking, improving cost visibility and reporting accuracy.",
    ],
  },
  {
    role: "Lead, Data Analytics & Business Intelligence",
    company: "The Tech Wave",
    period: "Nov 2021 – Jan 2023 | Jan 2019 – Oct 2020",
    location: "Karachi, Pakistan",
    description: [
      "Designed interactive dashboards in Power BI, Tableau, and Excel to meet client requirements and enable self-service reporting.",
      "Led product engineering and team innovation in data engineering, dashboarding, and Python-based automation.",
    ],
  },
  {
    role: "Data Analyst",
    company: "MavenMinds Private Limited",
    period: "Nov 2020 – Nov 2021",
    location: "Karachi, Pakistan",
    description: [
      "Automated collection and cleaning of data from multiple sources, ensuring data quality and reporting automation.",
      "Developed and maintained dashboards in Tableau, Power BI, and Excel to track KPIs and support strategic decisions.",
    ],
  },
];

export const trainingData = [
  {
    role: 'Trainer — "Dashboards using Power BI and Excel" (8-Week Program)',
    org: "Khair ul Amal Education Center",
    location: "Karachi, Pakistan",
    period: "May 2026 – Jul 2026",
    points: [
      "Designed and delivered a structured 8-week program taking learners from Excel foundations through Power Query, data modeling, DAX, and interactive Power BI dashboards.",
      "Guided learners through the complete BI workflow on real datasets, so every participant finished with a portfolio-ready capstone project.",
      "Trained in both English and Urdu to maximise comprehension and course completion for mixed-ability learners.",
    ],
  },
  {
    role: "Trainer — Advanced Excel & Tableau Training",
    org: "TGD Services DMCC",
    location: "Dubai, UAE",
    period: "Feb 2024 · 1 Week (10 Hours)",
    points: [
      "Delivered a focused practical program covering Advanced Excel and Tableau for analysis, visualization, and dashboarding.",
      "Walked a mixed-experience group of professionals through hands-on, job-ready exercises in both tools.",
    ],
  },
  {
    role: "Trainer — Power BI Workshop (Call Center Data Analysis)",
    org: "Habib Bank Limited (HBL)",
    location: "Karachi, Pakistan",
    period: "Jun 2023 · 2-Day Workshop",
    points: [
      "Delivered practical Power BI training for the HBL call-center team, focused on analyzing operational data.",
      "Guided participants through building interactive dashboards from real call-center datasets they could apply directly.",
    ],
  },
  {
    role: "Trainer — Excel, PowerPoint & Tableau Training",
    org: "Data n Dashboard",
    location: "Karachi, Pakistan",
    period: "Jul 2021 · 1 Week",
    points: [
      "Conducted practical training covering Excel analysis, PowerPoint presentation design, and Tableau dashboard development.",
      "Led hands-on sessions applying each tool to real analysis and reporting scenarios across varying experience levels.",
    ],
  },
  {
    role: "Analyst Mentorship & Team Capability Building",
    org: "Across analytics leadership roles",
    location: "Karachi / Remote",
    period: "2019 – Present",
    points: [
      "Mentored junior analysts into senior analytics roles, coaching on Power BI, SQL, data modeling, and stakeholder reporting.",
      "Built reusable dashboard templates, documentation, and reporting standards that reduced new-analyst ramp-up time.",
      "Ran internal knowledge-transfer sessions on dashboarding, DAX, and report automation.",
    ],
  },
];

export const courseModules = [
  "Excel for Analysis — PivotTables, dynamic-array formulas, Power Query",
  "Power BI Foundations — connecting & shaping data, reporting workflow",
  "Data Modeling & DAX — star schema, CALCULATE, time-intelligence",
  "Visualization & Design — chart selection, slicers, drill-through",
  "Publishing & Governance — Power BI Service, refresh, row-level security",
  "Tableau — calculated fields, interactive dashboards, Prep/Server",
  "SQL — joins, aggregations, querying for dashboards",
  "AI for Data Analysis — accelerating cleaning, DAX, insight generation",
  "Business Analysis — KPI definition, requirements, data storytelling",
];

// Flagship client / enterprise delivery projects
export const clientProjects = [
  {
    title: "Economy Digitalization Project (Waikato Region)",
    client: "Govt. of New Zealand",
    tech: ["Tableau Prep", "Desktop", "Server", "SQL", "Snowflake"],
    description:
      "Regional-government analytics programme tracking economic and institutional KPIs, with automated reporting replacing manual compilation.",
    impact: "Built & deployed 50+ production dashboards enabling evidence-based public-sector decisions.",
  },
  {
    title: "Sales Performance Dashboard Automation",
    client: "Telenor Pakistan",
    tech: ["Power Query", "Power BI", "SQL Server", "Python", "Excel"],
    description:
      "Daily KPI dashboard automating end-to-end data integration and reporting across sales and operations.",
    impact: "Reduced reporting turnaround time by 70% while improving figure accuracy and consistency.",
  },
  {
    title: "Real-Time ETL Sales Pipeline & Alerting",
    client: "Freelance",
    tech: ["ETL", "API", "Python", "BigQuery", "GCP"],
    description:
      "Real-time ingestion pipeline with an automated alerting system notifying teams of KPI breaches as they occurred.",
    impact: "Eliminated manual monitoring and shortened breach-to-response time.",
  },
  {
    title: "Agent Performance & Productivity System",
    client: "Habib Bank Limited",
    tech: ["Advanced Excel", "Power Query", "Power BI"],
    description:
      "Management dashboard monitoring customer-service and productivity metrics across contact-centre operations.",
    impact: "Improved ticket-resolution times and gave management direct cost visibility.",
  },
  {
    title: "Call Complaints & Marketing Performance System",
    client: "TGD Services DMCC",
    tech: ["Tableau SDK", "SQL", "MySQL", "ETL", "API"],
    description:
      "Embedded analytics dashboard tracking marketing-campaign performance alongside customer complaints.",
    impact: "Delivered a single real-time view, replacing separate manual reporting streams.",
  },
];

// Open-source / GitHub engineering projects
export const githubProjects = [
  {
    name: "retail-sales-analytics",
    description: "End-to-end retail sales EDA & executive KPI reporting in Python/pandas.",
    tech: ["Python", "pandas"],
    url: "https://github.com/syedjawaadali/retail-sales-analytics",
  },
  {
    name: "telecom-churn-prediction",
    description: "Telecom churn prediction with scikit-learn: RandomForest, ROC-AUC, churn-driver ranking.",
    tech: ["scikit-learn", "Python"],
    url: "https://github.com/syedjawaadali/telecom-churn-prediction",
  },
  {
    name: "realtime-etl-alerting",
    description: "Real-time micro-batch ETL with rolling KPIs and breach alerting.",
    tech: ["Python", "ETL"],
    url: "https://github.com/syedjawaadali/realtime-etl-alerting",
  },
  {
    name: "etl-pipeline-warehouse",
    description: "Modular extract-transform-quality-load pipeline into a SQLite star-schema warehouse.",
    tech: ["Python", "SQL"],
    url: "https://github.com/syedjawaadali/etl-pipeline-warehouse",
  },
  {
    name: "financial-forecasting",
    description: "Monthly revenue forecasting via additive trend + seasonal decomposition with MAPE backtest.",
    tech: ["NumPy", "Python"],
    url: "https://github.com/syedjawaadali/financial-forecasting",
  },
  {
    name: "customer-segmentation-rfm",
    description: "Customer segmentation with RFM scoring and K-Means clustering.",
    tech: ["scikit-learn", "Python"],
    url: "https://github.com/syedjawaadali/customer-segmentation-rfm",
  },
  {
    name: "healthcare-analytics",
    description: "Clinical-trial analytics: efficacy, safety and hypothesis testing with SciPy.",
    tech: ["SciPy", "Python"],
    url: "https://github.com/syedjawaadali/healthcare-analytics",
  },
  {
    name: "sql-analytics-portfolio",
    description: "Analytical SQL portfolio: window functions, CTEs, ranking & running totals.",
    tech: ["SQL", "SQLite"],
    url: "https://github.com/syedjawaadali/sql-analytics-portfolio",
  },
  {
    name: "data-quality-framework",
    description: "Lightweight, chainable data-quality rule engine for pandas DataFrames.",
    tech: ["Python", "pandas"],
    url: "https://github.com/syedjawaadali/data-quality-framework",
  },
  {
    name: "sales-kpi-dashboard",
    description: "Interactive sales KPI dashboard web app built with Streamlit.",
    tech: ["Streamlit", "Python"],
    url: "https://github.com/syedjawaadali/sales-kpi-dashboard",
  },
];

// Visual BI dashboard gallery (images extracted from BI portfolio)
const img = (file: string) => `${import.meta.env.BASE_URL}dashboards/${file}`;
const thumb = (file: string) => `${import.meta.env.BASE_URL}dashboards/thumbs/${file}`;
const dash = (title: string, tool: string, tags: string[], file: string) => ({
  title, tool, tags, src: img(file), thumb: thumb(file),
});
export const dashboards = [
  dash("Telecom FCA / Recharge Summary", "Power BI", ["Telecom", "KPI"], "telecom-fca-recharge-summary.jpg"),
  dash("FCA & iFCA Monthly Trends", "Power BI", ["Telecom", "Trend"], "telecom-fca-ifca-trends.jpg"),
  dash("Estimated Closing Trend", "Power BI", ["Telecom", "Forecast"], "telecom-estimated-closing-trend.jpg"),
  dash("Franchise Geo Distribution", "Power BI", ["GIS", "Maps"], "franchise-geo-distribution.jpg"),
  dash("MoM / QoQ Change Analysis", "Power BI", ["Variance"], "telecom-mom-qoq-analysis.jpg"),
  dash("Regional Sales Performance", "Power BI", ["Sales", "Retail"], "regional-sales-performance.jpg"),
  dash("Supply Performance Dashboard", "Power BI", ["Supply Chain"], "supply-performance.jpg"),
  dash("Call Center Performance Report", "Power BI", ["Operations"], "call-center-performance.jpg"),
  dash("Headcount Analytics", "Power BI", ["HR", "People"], "headcount-analytics.jpg"),
  dash("HR Salary & Bonus Analytics", "Power BI", ["HR", "Finance"], "hr-salary-bonus-analytics.jpg"),
  dash("Walmart Sales Dashboard", "Power BI", ["Retail", "Sales"], "walmart-sales-dashboard.jpg"),
  dash("Walmart Retail Data Analysis", "Power BI", ["Retail", "Profit"], "walmart-retail-analysis.jpg"),
  dash("Chocolate Performance Report", "Power BI", ["Sales", "Forecast"], "chocolate-performance-report.jpg"),
  dash("Simple Sales Dashboard", "Power BI", ["E-Commerce"], "simple-sales-dashboard.jpg"),
  dash("Waikato Housing Dampness", "Tableau", ["Public Sector", "Census"], "waikato-housing-dampness.jpg"),
  dash("NYC Emergency Response", "Tableau", ["Public Sector", "Geo"], "nyc-emergency-response.jpg"),
  dash("Social Media Campaign", "Tableau", ["Marketing"], "social-media-campaign.jpg"),
  dash("Spotify Artists & Songs", "Power BI", ["Entertainment"], "spotify-artists-songs.jpg"),
  dash("Financial Complaints Dashboard", "Tableau", ["Banking"], "financial-complaints.jpg"),
];

export const education = [
  {
    degree: "M.S. — Data Engineering & Information Management",
    school: "NED University of Engineering & Technology",
    period: "2021 – 2024",
    grade: "CGPA 3.4",
  },
  {
    degree: "B.S. — Economics & Finance",
    school: "NED University of Engineering & Technology",
    period: "2016 – 2020",
    grade: "CGPA 3.3",
  },
];

// Final Year / Capstone project. NOTE: placeholder derived from MS specialisation —
// replace title/description with the real FYP details.
export const finalYearProject = {
  title: "Final Year Project — Data Engineering & Information Management",
  school: "NED University of Engineering & Technology",
  summary:
    "Capstone in data engineering: designing an end-to-end pipeline and governed information model — ingestion, transformation, quality validation, and a dimensional warehouse feeding analytical dashboards.",
  tech: ["ETL", "SQL", "Data Modeling", "Python", "BI"],
};

export const certifications = [
  "IBM Data Science Professional Certificate",
  "Google Business Intelligence Specialization",
  "Business Intelligence for Consultants",
  "Prompt Engineering for Professionals",
];

export const certificationsInProgress = [
  "Microsoft PL-300: Power BI Data Analyst",
  "Microsoft Certified Trainer (MCT)",
  "MOS Specialist",
];

export const additionalInfo = {
  languages: "English (professional working proficiency), Urdu (native).",
  sectors: "Banking & financial services, telecom, healthcare & clinical research, public sector, hospitality, e-commerce.",
};
