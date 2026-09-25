// Reference control catalog for gap analysis. Intentionally a small,
// representative subset (not the full standard text — that's licensed
// content) so the Policy Gap Analysis playbook has something concrete to
// diff the org's evidence graph against. Extend per-pilot as needed, or
// replace with a licensed control-catalog import once available.

export interface FrameworkControl {
  frameworkId: "soc2" | "iso27001" | "nist_csf";
  controlRef: string;
  title: string;
  keywords: string[]; // used for a lightweight match against evidence_nodes.content
}

export const REFERENCE_CONTROLS: FrameworkControl[] = [
  // SOC 2 Trust Services Criteria (representative subset)
  { frameworkId: "soc2", controlRef: "CC6.1", title: "Logical access controls restrict unauthorized access", keywords: ["access control", "rbac", "least privilege"] },
  { frameworkId: "soc2", controlRef: "CC6.6", title: "Encryption of data at rest and in transit", keywords: ["encryption", "tls", "aes"] },
  { frameworkId: "soc2", controlRef: "CC7.2", title: "Security incidents are detected and monitored", keywords: ["monitoring", "siem", "incident detection"] },
  { frameworkId: "soc2", controlRef: "CC7.3", title: "Security incidents are responded to and remediated", keywords: ["incident response", "remediation"] },
  { frameworkId: "soc2", controlRef: "CC8.1", title: "Changes to infrastructure and software are authorized", keywords: ["change management", "deployment approval"] },
  { frameworkId: "soc2", controlRef: "A1.2", title: "Environmental and capacity monitoring for availability", keywords: ["availability", "uptime", "capacity"] },

  // ISO/IEC 27001:2022 Annex A (representative subset)
  { frameworkId: "iso27001", controlRef: "A.5.15", title: "Access control policy", keywords: ["access control policy", "rbac"] },
  { frameworkId: "iso27001", controlRef: "A.8.24", title: "Use of cryptography", keywords: ["encryption", "key management", "cryptography"] },
  { frameworkId: "iso27001", controlRef: "A.8.16", title: "Monitoring activities", keywords: ["monitoring", "logging", "siem"] },
  { frameworkId: "iso27001", controlRef: "A.5.24", title: "Incident management planning and preparation", keywords: ["incident response plan", "ir playbook"] },
  { frameworkId: "iso27001", controlRef: "A.8.9", title: "Configuration management", keywords: ["configuration management", "baseline config", "hardening"] },
  { frameworkId: "iso27001", controlRef: "A.6.3", title: "Information security awareness, education and training", keywords: ["security training", "awareness training"] },

  // NIST CSF 2.0 (representative subset, function-level)
  { frameworkId: "nist_csf", controlRef: "PR.AA-05", title: "Access permissions are managed with least privilege", keywords: ["least privilege", "access review"] },
  { frameworkId: "nist_csf", controlRef: "DE.CM-01", title: "Networks and network services are monitored", keywords: ["network monitoring", "siem"] },
  { frameworkId: "nist_csf", controlRef: "RS.MA-01", title: "Incident response plan is executed during or after an incident", keywords: ["incident response plan"] },
  { frameworkId: "nist_csf", controlRef: "ID.RA-01", title: "Vulnerabilities are identified and documented", keywords: ["vulnerability management", "vuln scanning"] },
];
