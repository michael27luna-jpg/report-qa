// // ======================================================
// // QA ANALYTICS TOOLS
// // ======================================================


// // ======================================================
// // GENERAL QA SUMMARY
// // ======================================================

// function getQAGeneralSummary(data = []) {

//   const safeData =
//     Array.isArray(data)
//       ? data
//       : [];

//   const total = safeData.length;

//   const passed = safeData.filter(
//     item => item.status === 'Passed'
//   ).length;

//   const opportunity = safeData.filter(
//     item => item.status === 'Opportunity'
//   ).length;

//   const failed = safeData.filter(
//     item => item.status === 'Failed'
//   ).length;

//   const critical = safeData.filter(
//     item => item.status === 'Critical'
//   ).length;

//   const errors =
//     failed + critical;

//   const passRate =
//     total > 0
//       ? ((passed + opportunity) / total) * 100
//       : 0;

//   const errorRate =
//     total > 0
//       ? (errors / total) * 100
//       : 0;

//   return {
//     total,
//     passed,
//     opportunity,
//     failed,
//     critical,
//     errors,
//     passRate,
//     errorRate
//   };
// }


// // ======================================================
// // QA MEMBER METRICS
// // ======================================================

// function getQAMemberMetrics(
//   data = [],
//   ownerName
// ) {

//   const safeData =
//     Array.isArray(data)
//       ? data
//       : [];

//   if (
//     !ownerName ||
//     typeof ownerName !== 'string'
//   ) {
//     return {
//       success: false,
//       code: 'OWNER_REQUIRED',
//       message:
//         'A valid owner name is required.'
//     };
//   }

//   const normalizedOwner =
//     ownerName.trim().toLowerCase();

//   const memberCases =
//     safeData.filter(
//       item =>
//         String(item.owner || '')
//           .trim()
//           .toLowerCase() === normalizedOwner
//     );

//   const total =
//     memberCases.length;

//   if (total === 0) {
//     return {
//       success: false,
//       code: 'OWNER_NOT_FOUND',
//       owner: ownerName,
//       message:
//         `No QA cases were found for owner "${ownerName}".`
//     };
//   }

//   const passed =
//     memberCases.filter(
//       item =>
//         item.status === 'Passed'
//     ).length;

//   const opportunity =
//     memberCases.filter(
//       item =>
//         item.status === 'Opportunity'
//     ).length;

//   const failed =
//     memberCases.filter(
//       item =>
//         item.status === 'Failed'
//     ).length;

//   const critical =
//     memberCases.filter(
//       item =>
//         item.status === 'Critical'
//     ).length;

//   const errors =
//     failed + critical;

//   const passRate =
//     total > 0
//       ? (
//           (passed + opportunity) /
//           total
//         ) * 100
//       : 0;

//   const errorRate =
//     total > 0
//       ? (errors / total) * 100
//       : 0;

//   return {
//     success: true,
//     owner: ownerName,
//     total,
//     passed,
//     opportunity,
//     failed,
//     critical,
//     errors,
//     passRate,
//     errorRate
//   };
// }
// // ======================================================
// // CLAUDE TOOL DEFINITIONS
// // ======================================================

// const QA_TOOLS = [

//   // ----------------------------------------------------
//   // GENERAL SUMMARY
//   // ----------------------------------------------------

//   {
//     name: 'qa_get_general_summary',

//     description:
//       `Get the general QA metrics for the dataset loaded in the current session.
//       Use this tool whenever the user asks about total cases, Passed cases,
//       Opportunity cases, Failed cases, Critical cases, total errors,
//       pass rate, error rate, or a general QA performance overview.
//       All metrics are calculated by the application from the current session
//       dataset. Never estimate these values yourself.`,

//     input_schema: {
//       type: 'object',
//       properties: {},
//       additionalProperties: false
//     }
//   },


//   // ----------------------------------------------------
//   // MEMBER METRICS
//   // ----------------------------------------------------

//   {
//     name: 'qa_get_member_metrics',

//     description:
//       `Get QA performance metrics for one specific team member (owner).
//       Use this tool when the user asks about an individual person's total cases,
//       Passed, Opportunity, Failed, Critical, errors, pass rate, or error rate.
//       The owner parameter must contain the team member name.
//       This tool analyzes only the current session dataset and does not modify data.`,

//     input_schema: {

//       type: 'object',

//       properties: {

//         owner: {
//           type: 'string',
//           description:
//             'Full name of the QA case owner to analyze.'
//         }

//       },

//       required: [
//         'owner'
//       ],

//       additionalProperties: false
//     }
//   }

// ];
// // ======================================================
// // TOOL EXECUTOR
// // ======================================================

// // function executeQATool(
// //   toolName,
// //   input,
// //   data
// // ) {

// //   console.log(
// //     '[QA TOOL] Executing:',
// //     toolName,
// //     input
// //   );

// //   switch (toolName) {

// //     // --------------------------------------------------
// //     // GENERAL SUMMARY
// //     // --------------------------------------------------

// //     case 'qa_get_general_summary':

// //       return getQAGeneralSummary(
// //         data
// //       );


// //     // --------------------------------------------------
// //     // MEMBER METRICS
// //     // --------------------------------------------------

// //     case 'qa_get_member_metrics':

// //       return getQAMemberMetrics(
// //         data,
// //         input.owner
// //       );


// //     // --------------------------------------------------
// //     // UNKNOWN TOOL
// //     // --------------------------------------------------

// //     default:

// //       throw new Error(
// //         `Unknown QA tool: ${toolName}`
// //       );
// //   }
// // }
// function executeQATool(
//   toolName,
//   input = {},
//   data = []
// ) {

//   console.log(
//     '[QA TOOL] Executing:',
//     toolName,
//     input
//   );

//   // ====================================================
//   // DATASET VALIDATION
//   // ====================================================

//   if (
//     !Array.isArray(data) ||
//     data.length === 0
//   ) {
//     return {
//       success: false,
//       code: 'NO_DATASET_LOADED',
//       message:
//         'No QA dataset is loaded in the current session.'
//     };
//   }


//   // ====================================================
//   // TOOL ROUTER
//   // ====================================================

//   switch (toolName) {

//     // --------------------------------------------------
//     // GENERAL SUMMARY
//     // --------------------------------------------------

//     case 'qa_get_general_summary':

//       return getQAGeneralSummary(
//         data
//       );


//     // --------------------------------------------------
//     // MEMBER METRICS
//     // --------------------------------------------------

//     case 'qa_get_member_metrics':

//       return getQAMemberMetrics(
//         data,
//         input.owner
//       );


//     // --------------------------------------------------
//     // UNKNOWN TOOL
//     // --------------------------------------------------

//     default:

//       throw new Error(
//         `Unknown QA tool: ${toolName}`
//       );
//   }
// }

// // ======================================================
// // EXPORTS
// // ======================================================

// module.exports = {
//   QA_TOOLS,
//   executeQATool,
//   getQAGeneralSummary,
//   getQAMemberMetrics
// };
// ======================================================
// QA SHADOW DASHBOARD
// FULL QA AGENT TOOLSET
// ======================================================


// ======================================================
// CONSTANTS
// ======================================================

const VALID_STATUSES = [
  'Passed',
  'Opportunity',
  'Failed',
  'Critical'
];

const VALID_TYPES = [
  'LP',
  'Posting',
  'Unknown'
];


// ======================================================
// GENERIC HELPERS
// ======================================================

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}


function getSafeData(data) {
  return Array.isArray(data)
    ? data
    : [];
}


function toTimestamp(value) {
  if (!value) {
    return null;
  }

  const parts =
    String(value)
      .trim()
      .split('/');

  if (parts.length !== 3) {
    return null;
  }

  const [month, day, rawYear] = parts;

  const year =
    rawYear.length === 2
      ? Number(`20${rawYear}`)
      : Number(rawYear);

  const date =
    new Date(
      year,
      Number(month) - 1,
      Number(day)
    );

  const timestamp =
    date.getTime();

  return Number.isNaN(timestamp)
    ? null
    : timestamp;
}


function getUniqueValues(
  data,
  field
) {
  return [
    ...new Set(
      data
        .map(item => item[field])
        .filter(Boolean)
    )
  ].sort();
}


// ======================================================
// RESOLVE OWNER / REVIEWER
// ======================================================

function resolveDatasetValue(
  data,
  field,
  requestedValue
) {

  if (
    !requestedValue ||
    typeof requestedValue !== 'string'
  ) {
    return {
      success: false,
      code: 'VALUE_REQUIRED',
      message: `${field} is required.`
    };
  }

  const values =
    getUniqueValues(
      data,
      field
    );

  const target =
    normalizeText(
      requestedValue
    );


  // Exact normalized match
  const exact =
    values.find(
      value =>
        normalizeText(value) === target
    );

  if (exact) {
    return {
      success: true,
      value: exact
    };
  }


  // Unique partial match
  const partialMatches =
    values.filter(value => {

      const normalized =
        normalizeText(value);

      return (
        normalized.includes(target) ||
        target.includes(normalized)
      );

    });


  if (
    partialMatches.length === 1
  ) {
    return {
      success: true,
      value: partialMatches[0]
    };
  }


  if (
    partialMatches.length > 1
  ) {
    return {
      success: false,
      code: 'AMBIGUOUS_VALUE',
      requestedValue,
      options:
        partialMatches.slice(0, 20),
      message:
        `More than one ${field} matches "${requestedValue}".`
    };
  }


  return {
    success: false,
    code: 'VALUE_NOT_FOUND',
    requestedValue,
    message:
      `No ${field} matching "${requestedValue}" was found.`
  };
}


// ======================================================
// CORE METRICS
// ======================================================

function calculateMetrics(
  cases = []
) {

  const total =
    cases.length;

  const passed =
    cases.filter(
      item =>
        item.status === 'Passed'
    ).length;

  const opportunity =
    cases.filter(
      item =>
        item.status === 'Opportunity'
    ).length;

  const failed =
    cases.filter(
      item =>
        item.status === 'Failed'
    ).length;

  const critical =
    cases.filter(
      item =>
        item.status === 'Critical'
    ).length;

  const errors =
    failed + critical;

  const acceptable =
    passed + opportunity;

  const passRate =
    total > 0
      ? (acceptable / total) * 100
      : 0;

  const errorRate =
    total > 0
      ? (errors / total) * 100
      : 0;

  return {
    total,
    passed,
    opportunity,
    failed,
    critical,
    acceptable,
    errors,
    passRate,
    errorRate
  };
}


// ======================================================
// GENERAL SUMMARY
// ======================================================

function getQAGeneralSummary(
  data = []
) {

  const safeData =
    getSafeData(data);

  const metrics =
    calculateMetrics(
      safeData
    );

  const pending =
    safeData.filter(item =>
      item.status !== 'Passed' &&
      !String(
        item.fix_comment || ''
      ).trim()
    ).length;

  const owners =
    getUniqueValues(
      safeData,
      'owner'
    );

  const reviewers =
    getUniqueValues(
      safeData,
      'qa_by'
    );

  return {
    success: true,

    ...metrics,

    pending,

    teamMembers:
      owners.length,

    reviewers:
      reviewers.length
  };
}
// ======================================================
// MEMBER METRICS
// ======================================================

function getQAMemberMetrics(
  data = [],
  ownerName
) {

  const safeData =
    getSafeData(data);

  const resolution =
    resolveDatasetValue(
      safeData,
      'owner',
      ownerName
    );

  if (!resolution.success) {
    return resolution;
  }

  const owner =
    resolution.value;

  const memberCases =
    safeData.filter(
      item =>
        item.owner === owner
    );

  const metrics =
    calculateMetrics(
      memberCases
    );


  // ----------------------------------------------------
  // BY TYPE
  // ----------------------------------------------------

  const byType = {};

  VALID_TYPES.forEach(type => {

    const typeCases =
      memberCases.filter(
        item =>
          item.type === type
      );

    byType[type] =
      calculateMetrics(
        typeCases
      );

  });


  // ----------------------------------------------------
  // CATEGORIES
  // ----------------------------------------------------

  const categoryCounts = {};

  memberCases.forEach(item => {

    if (
      item.status === 'Passed' ||
      !Array.isArray(item.categories)
    ) {
      return;
    }

    const unique =
      [
        ...new Set(
          item.categories.filter(Boolean)
        )
      ];

    unique.forEach(category => {

      categoryCounts[category] =
        (categoryCounts[category] || 0) + 1;

    });

  });


  const categories =
    Object.entries(
      categoryCounts
    )
      .map(
        ([category, count]) => ({
          category,
          count
        })
      )
      .sort(
        (a, b) =>
          b.count - a.count
      );


  return {
    success: true,

    owner,

    ...metrics,

    byType,

    categories
  };
}
// ======================================================
// MEMBER RANKING
// ======================================================

function getQAMemberRanking(
  data = [],
  options = {}
) {

  const safeData =
    getSafeData(data);

  const {
    metric = 'errors',
    direction = 'desc',
    limit = 10
  } = options;


  const allowedMetrics = [
    'total',
    'passed',
    'opportunity',
    'failed',
    'critical',
    'errors',
    'passRate',
    'errorRate'
  ];


  const selectedMetric =
    allowedMetrics.includes(metric)
      ? metric
      : 'errors';


  const owners =
    getUniqueValues(
      safeData,
      'owner'
    );


  const ranking =
    owners.map(owner => {

      const cases =
        safeData.filter(
          item =>
            item.owner === owner
        );

      return {
        owner,
        ...calculateMetrics(cases)
      };

    });


  ranking.sort(
    (a, b) => {

      const difference =
        a[selectedMetric] -
        b[selectedMetric];

      if (
        direction === 'asc'
      ) {
        return difference;
      }

      return -difference;
    }
  );


  return {
    success: true,

    metric:
      selectedMetric,

    direction,

    totalMembers:
      ranking.length,

    ranking:
      ranking.slice(
        0,
        Math.min(
          Math.max(limit, 1),
          50
        )
      )
  };
}
// ======================================================
// COMPARE MEMBERS
// ======================================================

function compareQAMembers(
  data = [],
  ownerA,
  ownerB
) {

  const memberA =
    getQAMemberMetrics(
      data,
      ownerA
    );

  if (!memberA.success) {
    return {
      success: false,
      member: 'A',
      details: memberA
    };
  }


  const memberB =
    getQAMemberMetrics(
      data,
      ownerB
    );

  if (!memberB.success) {
    return {
      success: false,
      member: 'B',
      details: memberB
    };
  }


  return {
    success: true,

    memberA,
    memberB,

    difference: {

      total:
        memberA.total -
        memberB.total,

      errors:
        memberA.errors -
        memberB.errors,

      failed:
        memberA.failed -
        memberB.failed,

      critical:
        memberA.critical -
        memberB.critical,

      passRate:
        memberA.passRate -
        memberB.passRate,

      errorRate:
        memberA.errorRate -
        memberB.errorRate
    }
  };
}
// ======================================================
// CATEGORY ANALYSIS
// ======================================================

function getQACategoryAnalysis(
  data = [],
  options = {}
) {

  const safeData =
    getSafeData(data);


  const {
    owner = null,

    statuses = [
      'Opportunity',
      'Failed',
      'Critical'
    ],

    type = null
  } = options;


  let resolvedOwner = null;


  if (owner) {

    const resolution =
      resolveDatasetValue(
        safeData,
        'owner',
        owner
      );

    if (!resolution.success) {
      return resolution;
    }

    resolvedOwner =
      resolution.value;
  }


  const safeStatuses =
    Array.isArray(statuses)
      ? statuses
      : [];


  const scopedCases =
    safeData.filter(item => {

      if (
        resolvedOwner &&
        item.owner !== resolvedOwner
      ) {
        return false;
      }

      if (
        type &&
        item.type !== type
      ) {
        return false;
      }

      if (
        safeStatuses.length &&
        !safeStatuses.includes(
          item.status
        )
      ) {
        return false;
      }

      return true;
    });


  const categorizedCases =
    scopedCases.filter(item =>
      Array.isArray(
        item.categories
      ) &&
      item.categories.length > 0
    );


  const categoryMap =
    new Map();


  categorizedCases.forEach(item => {

    const uniqueCategories =
      [
        ...new Set(
          item.categories.filter(Boolean)
        )
      ];


    uniqueCategories.forEach(
      category => {

        if (
          !categoryMap.has(category)
        ) {

          categoryMap.set(
            category,
            {
              category,

              count: 0,

              byType: {
                LP: 0,
                Posting: 0,
                Unknown: 0
              }
            }
          );

        }


        const entry =
          categoryMap.get(
            category
          );

        entry.count += 1;


        const caseType =
          VALID_TYPES.includes(
            item.type
          )
            ? item.type
            : 'Unknown';


        entry.byType[caseType] += 1;

      }
    );

  });


  const categories =
    [
      ...categoryMap.values()
    ]
      .map(item => ({

        ...item,

        percentageOfScope:
          scopedCases.length > 0
            ? (
                item.count /
                scopedCases.length
              ) * 100
            : 0,

        percentageOfCategorizedCases:
          categorizedCases.length > 0
            ? (
                item.count /
                categorizedCases.length
              ) * 100
            : 0

      }))
      .sort(
        (a, b) =>
          b.count - a.count
      );


  const totalOccurrences =
    categories.reduce(
      (sum, item) =>
        sum + item.count,
      0
    );


  return {
    success: true,

    filters: {
      owner:
        resolvedOwner,

      statuses:
        safeStatuses,

      type
    },

    scopedCases:
      scopedCases.length,

    categorizedCases:
      categorizedCases.length,

    uncategorizedCases:
      scopedCases.length -
      categorizedCases.length,

    totalOccurrences,

    categories
  };
}
// ======================================================
// QUEUE / PENDING ANALYSIS
// ======================================================

function getQAQueueAnalysis(
  data = [],
  options = {}
) {

  const safeData =
    getSafeData(data);


  const {
    owner = null,
    reviewer = null,
    type = null,
    limit = 10
  } = options;


  let scoped =
    [...safeData];


  // ----------------------------------------------------
  // OWNER
  // ----------------------------------------------------

  if (owner) {

    const resolution =
      resolveDatasetValue(
        scoped,
        'owner',
        owner
      );

    if (!resolution.success) {
      return resolution;
    }

    scoped =
      scoped.filter(
        item =>
          item.owner ===
          resolution.value
      );
  }


  // ----------------------------------------------------
  // REVIEWER
  // ----------------------------------------------------

  if (reviewer) {

    const resolution =
      resolveDatasetValue(
        scoped,
        'qa_by',
        reviewer
      );

    if (!resolution.success) {
      return resolution;
    }

    scoped =
      scoped.filter(
        item =>
          item.qa_by ===
          resolution.value
      );
  }


  // ----------------------------------------------------
  // TYPE
  // ----------------------------------------------------

  if (type) {

    scoped =
      scoped.filter(
        item =>
          item.type === type
      );
  }


  const nonPassed =
    scoped.filter(
      item =>
        item.status !== 'Passed'
    );


  const pending =
    nonPassed.filter(
      item =>
        !String(
          item.fix_comment || ''
        ).trim()
    );


  const responded =
    nonPassed.filter(
      item =>
        String(
          item.fix_comment || ''
        ).trim()
    );


  const queueStatus =
    pending.length > 10
      ? 'AT_RISK'
      : pending.length >= 5
        ? 'WATCH'
        : 'STABLE';


  return {
    success: true,

    totalScoped:
      scoped.length,

    nonPassed:
      nonPassed.length,

    pending:
      pending.length,

    responded:
      responded.length,

    queueStatus,

    pendingExamples:
    pending
      .slice(
        0,
        Math.min(limit, 25)
      )
      .map(
        item =>
          projectCase(
            item,
            false
          )
      )
  };
}
// ======================================================
// CASE PROJECTION
// ======================================================

function projectCase(
  item,
  includeComments = false
) {

  const result = {
    task_id:
      item.task_id,

    owner:
      item.owner,

    status:
      item.status,

    type:
      item.type,

    qa_by:
      item.qa_by,

    day:
      item.day,

    completed_date:
      item.completed_date,

    categories:
      Array.isArray(
        item.categories
      )
        ? item.categories
        : []
  };


  if (includeComments) {

    result.summary =
      item.summary || '';

    result.fix_comment =
      item.fix_comment || '';
  }


  return result;
}
// ======================================================
// QA REVIEWER ANALYSIS
// ======================================================

function calculateReviewerMetrics(
  cases
) {

  return {
    ...calculateMetrics(cases)
  };
}


function getQAReviewerAnalysis(
  data = [],
  reviewerName = null
) {

  const safeData =
    getSafeData(data);


  // ====================================================
  // ONE REVIEWER
  // ====================================================

  if (reviewerName) {

    const resolution =
      resolveDatasetValue(
        safeData,
        'qa_by',
        reviewerName
      );

    if (!resolution.success) {
      return resolution;
    }


    const reviewer =
      resolution.value;


    const cases =
      safeData.filter(
        item =>
          item.qa_by === reviewer
      );


    return {
      success: true,

      reviewer,

      ...calculateReviewerMetrics(
        cases
      )
    };
  }


  // ====================================================
  // ALL REVIEWERS
  // ====================================================

  const reviewers =
    getUniqueValues(
      safeData,
      'qa_by'
    );


  const ranking =
    reviewers
      .map(reviewer => {

        const cases =
          safeData.filter(
            item =>
              item.qa_by === reviewer
          );

        return {
          reviewer,
          ...calculateReviewerMetrics(
            cases
          )
        };

      })
      .sort(
        (a, b) =>
          b.total - a.total
      );


  return {
    success: true,

    totalReviewers:
      ranking.length,

    reviewers:
      ranking
  };
}
// ======================================================
// CASES BY FILTERS
// ======================================================

function getQACasesByFilters(
  data = [],
  filters = {}
) {

  const safeData =
    getSafeData(data);


  const {
    dateFrom = null,
    dateTo = null,

    completedDateFrom = null,
    completedDateTo = null,

    statuses = [],
    owners = [],
    reviewers = [],
    categories = [],
    types = [],

    search = '',

    includeComments = false,

    limit = 25
  } = filters;


  let rows =
    [...safeData];


  // ====================================================
  // OWNER COMPLETED DATE
  // ====================================================

  if (completedDateFrom) {

    const from =
      toTimestamp(
        completedDateFrom
      );

    const to =
      toTimestamp(
        completedDateTo ||
        completedDateFrom
      );


    rows =
      rows.filter(item => {

        const timestamp =
          toTimestamp(
            item.completed_date
          );

        return (
          timestamp !== null &&
          timestamp >= from &&
          timestamp <= to
        );
      });
  }


  // ====================================================
  // QA COMPLETED DATE
  // ====================================================

  if (dateFrom) {

    const from =
      toTimestamp(
        dateFrom
      );

    const to =
      toTimestamp(
        dateTo ||
        dateFrom
      );


    rows =
      rows.filter(item => {

        const timestamp =
          toTimestamp(
            item.day
          );

        return (
          timestamp !== null &&
          timestamp >= from &&
          timestamp <= to
        );
      });
  }


  // ====================================================
  // STATUS
  // ====================================================

  if (
    Array.isArray(statuses) &&
    statuses.length
  ) {

    rows =
      rows.filter(item => {

        return statuses.some(
          status => {

            if (
              status === 'Pending'
            ) {
              return (
                item.status !== 'Passed' &&
                !String(
                  item.fix_comment || ''
                ).trim()
              );
            }


            if (
              status === 'Responded'
            ) {
              return (
                item.status !== 'Passed' &&
                Boolean(
                  String(
                    item.fix_comment || ''
                  ).trim()
                )
              );
            }


            return (
              item.status === status
            );

          }
        );

      });
  }


  // ====================================================
  // OWNERS
  // ====================================================

  if (
    Array.isArray(owners) &&
    owners.length
  ) {

    const normalized =
      owners.map(
        normalizeText
      );


    rows =
      rows.filter(item =>
        normalized.includes(
          normalizeText(
            item.owner
          )
        )
      );
  }


  // ====================================================
  // REVIEWERS
  // ====================================================

  if (
    Array.isArray(reviewers) &&
    reviewers.length
  ) {

    const normalized =
      reviewers.map(
        normalizeText
      );


    rows =
      rows.filter(item =>
        normalized.includes(
          normalizeText(
            item.qa_by
          )
        )
      );
  }


  // ====================================================
  // CATEGORY
  // ====================================================

  if (
    Array.isArray(categories) &&
    categories.length
  ) {

    const normalizedCategories =
      categories.map(
        normalizeText
      );


    rows =
      rows.filter(item => {

        const itemCategories =
          Array.isArray(
            item.categories
          )
            ? item.categories.map(
                normalizeText
              )
            : [];


        return normalizedCategories
          .some(
            category =>
              itemCategories.includes(
                category
              )
          );
      });
  }


  // ====================================================
  // TYPE
  // ====================================================

  if (
    Array.isArray(types) &&
    types.length
  ) {

    rows =
      rows.filter(item =>
        types.includes(
          item.type
        )
      );
  }


  // ====================================================
  // SEARCH
  // ====================================================

  if (
    search &&
    String(search).trim()
  ) {

    const query =
      normalizeText(
        search
      );


    rows =
      rows.filter(item => {

        const searchable = [
          item.owner,
          item.task_id,
          item.summary,
          item.fix_comment,
          item.qa_by
        ];

        return searchable.some(
          value =>
            normalizeText(
              value
            ).includes(
              query
            )
        );

      });
  }


  // ====================================================
  // SAFE RESULT LIMIT
  // ====================================================

  const safeLimit =
    Math.min(
      Math.max(
        Number(limit) || 25,
        1
      ),
      50
    );


  return {
    success: true,

    totalMatched:
      rows.length,

    returned:
      Math.min(
        rows.length,
        safeLimit
      ),

    hasMore:
      rows.length >
      safeLimit,

    cases:
      rows
        .slice(
          0,
          safeLimit
        )
        .map(item =>
          projectCase(
            item,
            includeComments
          )
        )
  };
}
// ======================================================
// WEEKLY STATUS ANALYSIS
// ======================================================

function getQAWeeklyStatusAnalysis(
  data = [],
  options = {}
) {

  const safeData =
    getSafeData(data);


  const weekScope =
    getQAWeekScope(
      safeData,
      options
    );


  if (!weekScope.success) {
    return weekScope;
  }


  const weeklyData =
    weekScope.data;


  const summary =
    getQAGeneralSummary(
      weeklyData
    );


  const {
    total,
    failed,
    critical,
    errors,
    opportunity,
    pending
  } = summary;


  const criticalPct =
    total > 0
      ? (
          critical /
          total
        ) * 100
      : 0;


  const failedPct =
    total > 0
      ? (
          failed /
          total
        ) * 100
      : 0;


  const opportunityPct =
    total > 0
      ? (
          opportunity /
          total
        ) * 100
      : 0;


  // ====================================================
  // CRITICAL SCORE
  // ====================================================

  const criticalPoints =
    criticalPct > 1
      ? 3
      : criticalPct > 0
        ? 1
        : 0;


  // ====================================================
  // FAILED SCORE
  // ====================================================

  const failedPoints =
    failedPct > 3
      ? 2
      : failedPct > 1.5
        ? 1
        : 0;


  // ====================================================
  // PENDING SCORE
  // ====================================================

  const pendingPoints =
    pending > 20
      ? 3
      : pending >= 10
        ? 2
        : 1;


  const severityScore =
    criticalPoints +
    failedPoints;


  const finalScore =
    severityScore +
    pendingPoints;


  let finalStatus;


  if (
    finalScore >= 7
  ) {

    finalStatus =
      'AT_RISK';

  } else if (
    finalScore >= 4
  ) {

    finalStatus =
      'NEEDS_ATTENTION';

  } else if (
    errors === 0
  ) {

    finalStatus =
      'CLEAN_WEEK';

  } else {

    finalStatus =
      'UNDER_CONTROL';
  }


  // ====================================================
  // PERIOD
  // ====================================================

  const days =
    [
      ...new Set(
        weeklyData
          .map(item => item.day)
          .filter(Boolean)
      )
    ]
      .sort(
        (a, b) =>
          toTimestamp(a) -
          toTimestamp(b)
      );


  const period = {
    from:
      days[0] || null,

    to:
      days.length
        ? days[
            days.length - 1
          ]
        : null
  };


  // ====================================================
  // MEMBERS AT RISK
  // ====================================================

  const owners =
    getUniqueValues(
      weeklyData,
      'owner'
    );


  const atRiskMembers =
    owners
      .map(owner => {

        const cases =
          weeklyData.filter(
            item =>
              item.owner === owner
          );


        const metrics =
          calculateMetrics(
            cases
          );


        return {
          owner,
          errors:
            metrics.errors,
          total:
            metrics.total,
          errorRate:
            metrics.errorRate
        };
      })
      .filter(
        member =>
          member.errorRate > 10
      )
      .sort(
        (a, b) =>
          b.errorRate -
          a.errorRate
      );


  const categoryAnalysis =
    getQACategoryAnalysis(
      weeklyData
    );


  return {
    success: true,

    period,

    summary,

    percentages: {
      critical:
        criticalPct,

      failed:
        failedPct,

      opportunity:
        opportunityPct
    },

    scope: {
      source:
        weekScope.source,

      totalCases:
        weeklyData.length
    },

    scoring: {
      criticalPoints,
      failedPoints,
      pendingPoints,
      severityScore,
      finalScore
    },

    finalStatus,

    atRiskMembers,

    topCategories:
      categoryAnalysis.success
        ? categoryAnalysis.categories
            .slice(0, 5)
        : []
  };
}

// ======================================================
// WEEK SCOPE
// ======================================================

function getQAWeekScope(
  data = [],
  options = {}
) {

  const safeData =
    getSafeData(data);

  const {
    dateFrom = null,
    dateTo = null
  } = options;


  // ====================================================
  // EXPLICIT DATE RANGE
  // ====================================================

  if (dateFrom) {

    const from =
      toTimestamp(
        dateFrom
      );

    const to =
      toTimestamp(
        dateTo ||
        dateFrom
      );


    if (
      from === null ||
      to === null
    ) {

      return {
        success: false,

        code:
          'INVALID_DATE_RANGE',

        message:
          'Invalid weekly date range.'
      };
    }


    const scopedData =
      safeData.filter(
        item => {

          const timestamp =
            toTimestamp(
              item.day
            );

          return (
            timestamp !== null &&
            timestamp >= from &&
            timestamp <= to
          );
        }
      );


    return {
      success: true,

      data:
        scopedData,

      dateFrom,

      dateTo:
        dateTo || dateFrom,

      source:
        'explicit_range'
    };
  }


  // ====================================================
  // FIND LATEST QA DATE
  // ====================================================

  const timestamps =
    safeData
      .map(
        item =>
          toTimestamp(
            item.day
          )
      )
      .filter(
        timestamp =>
          timestamp !== null
      );


  if (
    timestamps.length === 0
  ) {

    return {
      success: false,

      code:
        'NO_VALID_QA_DATES',

      message:
        'No valid QA completion dates were found.'
    };
  }


  const latestTimestamp =
    Math.max(
      ...timestamps
    );


  const latestDate =
    new Date(
      latestTimestamp
    );


  const weekday =
    latestDate.getDay();


  // Sunday = 0
  // Monday = 1
  const daysFromMonday =
    weekday === 0
      ? 6
      : weekday - 1;


  const DAY_MS =
    24 * 60 * 60 * 1000;


  const weekStart =
    latestTimestamp -
    (
      daysFromMonday *
      DAY_MS
    );


  const weekEnd =
    weekStart +
    (
      6 *
      DAY_MS
    );


  const scopedData =
    safeData.filter(
      item => {

        const timestamp =
          toTimestamp(
            item.day
          );

        return (
          timestamp !== null &&
          timestamp >= weekStart &&
          timestamp <= weekEnd
        );
      }
    );


  return {
    success: true,

    data:
      scopedData,

    weekStart,

    weekEnd,

    source:
      'latest_dataset_week'
  };
}

// ======================================================
// DATASET DIMENSIONS
// ======================================================

function getQADatasetDimensions(
  data = []
) {

  const safeData =
    getSafeData(data);


  const categories =
    [
      ...new Set(
        safeData.flatMap(
          item =>
            Array.isArray(
              item.categories
            )
              ? item.categories
              : []
        )
      )
    ].sort();


  const days =
    [
      ...new Set(
        safeData
          .map(item => item.day)
          .filter(Boolean)
      )
    ]
      .sort(
        (a, b) =>
          toTimestamp(a) -
          toTimestamp(b)
      );


  return {
    success: true,

    totalCases:
      safeData.length,

    owners:
      getUniqueValues(
        safeData,
        'owner'
      ),

    reviewers:
      getUniqueValues(
        safeData,
        'qa_by'
      ),

    categories,

    types:
      getUniqueValues(
        safeData,
        'type'
      ),

    statuses:
      getUniqueValues(
        safeData,
        'status'
      ),

    period: {
      from:
        days[0] || null,

      to:
        days.length
          ? days[
              days.length - 1
            ]
          : null
    }
  };
}
// ======================================================
// CLAUDE TOOL DEFINITIONS
// ======================================================

const QA_TOOLS = [

  // ====================================================
  // GENERAL SUMMARY
  // ====================================================

  {
    name:
      'qa_get_general_summary',

    description:
      `Get general QA metrics for the current dataset.
      Use for total cases, Passed, Opportunity, Failed,
      Critical, total errors, pass rate, error rate,
      pending cases, team size, or overall QA performance.`,

    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },


  // ====================================================
  // MEMBER
  // ====================================================

  {
    name:
      'qa_get_member_metrics',

    description:
      `Get QA performance for one case owner.
      Use when asking about a specific team member's
      cases, statuses, errors, pass rate, error rate,
      categories, or performance by case type.
      This is OWNER performance, not QA reviewer activity.`,

    input_schema: {
      type: 'object',

      properties: {
        owner: {
          type: 'string',
          description:
            'Name of the case owner.'
        }
      },

      required: [
        'owner'
      ],

      additionalProperties: false
    }
  },


  // ====================================================
  // RANK MEMBERS
  // ====================================================

  {
    name:
      'qa_rank_members',

    description:
      `Rank case owners using an objective QA metric.
      Use for questions such as who has the most errors,
      highest pass rate, lowest error rate, most cases,
      most Failed, or most Critical cases.`,

    input_schema: {
      type: 'object',

      properties: {

        metric: {
          type: 'string',

          enum: [
            'total',
            'passed',
            'opportunity',
            'failed',
            'critical',
            'errors',
            'passRate',
            'errorRate'
          ]
        },

        direction: {
          type: 'string',
          enum: [
            'asc',
            'desc'
          ]
        },

        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50
        }
      },

      additionalProperties: false
    }
  },


  // ====================================================
  // COMPARE
  // ====================================================

  {
    name:
      'qa_compare_members',

    description:
      `Compare two QA case owners using the same metrics.
      Use for objective comparisons between two team members.`,

    input_schema: {
      type: 'object',

      properties: {

        ownerA: {
          type: 'string'
        },

        ownerB: {
          type: 'string'
        }
      },

      required: [
        'ownerA',
        'ownerB'
      ],

      additionalProperties: false
    }
  },


  // ====================================================
  // CATEGORY
  // ====================================================

  {
    name:
      'qa_get_category_analysis',

    description:
      `Analyze detected QA bug categories.
      Use for top bug category, category breakdown,
      category frequency, categories for one owner,
      or categories for LP/Posting cases.
      By default analyzes Opportunity, Failed and Critical cases.`,

    input_schema: {
      type: 'object',

      properties: {

        owner: {
          type: 'string'
        },

        statuses: {
          type: 'array',

          items: {
            type: 'string',

            enum: [
              'Passed',
              'Opportunity',
              'Failed',
              'Critical'
            ]
          }
        },

        type: {
          type: 'string',

          enum: [
            'LP',
            'Posting',
            'Unknown'
          ]
        }
      },

      additionalProperties: false
    }
  },


  // ====================================================
  // QUEUE
  // ====================================================

  {
    name:
      'qa_get_queue_analysis',

    description:
      `Analyze pending QA fixes and responded cases.
      Pending means a non-Passed case without a QA Fix Comment.
      Use for pending workload, queue condition,
      unresolved issues, or cases waiting for a fix.`,

    input_schema: {
      type: 'object',

      properties: {

        owner: {
          type: 'string'
        },

        reviewer: {
          type: 'string'
        },

        type: {
          type: 'string',

          enum: [
            'LP',
            'Posting',
            'Unknown'
          ]
        },

        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 25
        }
      },

      additionalProperties: false
    }
  },


  // ====================================================
  // REVIEWER
  // ====================================================

  {
    name:
      'qa_get_reviewer_analysis',

    description:
      `Analyze QA reviewer activity using the qa_by field.
      Use for how many reviews a QA performed,
      statuses found by that reviewer,
      reviewer workload, or who performed the most reviews.
      Do not use this tool for case-owner performance.`,

    input_schema: {
      type: 'object',

      properties: {

        reviewer: {
          type: 'string'
        }
      },

      additionalProperties: false
    }
  },


  // ====================================================
  // CASE FILTER
  // ====================================================

  {
    name:
      'qa_get_cases_by_filters',

    description:
      `Search and count QA cases using structured filters.
      Use for questions involving dates, statuses,
      owners, QA reviewers, categories, case types,
      pending/responded cases, task IDs, comments,
      or combinations of filters.
      Returns totalMatched plus a limited evidence sample.`,

    input_schema: {

      type: 'object',

      properties: {

        dateFrom: {
          type: 'string',
          description:
            'QA completion date in M/D/YY format.'
        },

        dateTo: {
          type: 'string'
        },

        completedDateFrom: {
          type: 'string',
          description:
            'Owner completion Date column in M/D/YY format.'
        },

        completedDateTo: {
          type: 'string'
        },

        statuses: {
          type: 'array',

          items: {
            type: 'string',

            enum: [
              'Passed',
              'Opportunity',
              'Failed',
              'Critical',
              'Pending',
              'Responded'
            ]
          }
        },

        owners: {
          type: 'array',
          items: {
            type: 'string'
          }
        },

        reviewers: {
          type: 'array',
          items: {
            type: 'string'
          }
        },

        categories: {
          type: 'array',
          items: {
            type: 'string'
          }
        },

        types: {
          type: 'array',

          items: {
            type: 'string',

            enum: [
              'LP',
              'Posting',
              'Unknown'
            ]
          }
        },

        search: {
          type: 'string'
        },

        includeComments: {
          type: 'boolean'
        },

        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50
        }
      },

      additionalProperties: false
    }
  },


  // ====================================================
  // WEEKLY STATUS
  // ====================================================

  {
    name:
      'qa_get_weekly_status',

    description:
      `Calculate the official QA weekly status using
      Critical percentage, Failed percentage,
      pending-case scoring, at-risk members,
      and the defined weekly thresholds.
      Use whenever the user asks whether the week
      is clean, under control, needs attention, or at risk.`,

    input_schema: {

      type: 'object',

      properties: {

        dateFrom: {
          type: 'string',

          description:
            'Optional start QA date in M/D/YY format.'
        },

        dateTo: {
          type: 'string',

          description:
            'Optional end QA date in M/D/YY format.'
        }

      },

      additionalProperties: false
    }
  },


  // ====================================================
  // DATASET DIMENSIONS
  // ====================================================

  {
    name:
      'qa_get_dataset_dimensions',

    description:
      `Get valid owners, QA reviewers, categories,
      case types, statuses, period and dataset size.
      Use when the user asks who is in the dataset,
      what values exist, or when a name/filter needs
      to be identified before another QA query.`,

    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  }

];
// ======================================================
// QA TOOL EXECUTOR
// ======================================================

function executeQATool(
  toolName,
  input = {},
  data = []
) {

  console.log(
    '[QA TOOL] Executing:',
    toolName,
    input
  );


  // ====================================================
  // DATA VALIDATION
  // ====================================================

  if (
    !Array.isArray(data) ||
    data.length === 0
  ) {

    return {
      success: false,

      code:
        'NO_DATASET_LOADED',

      message:
        'No QA dataset is loaded in the current session.'
    };
  }


  // ====================================================
  // ROUTER
  // ====================================================

  switch (toolName) {

    case 'qa_get_general_summary':

      return getQAGeneralSummary(
        data
      );


    case 'qa_get_member_metrics':

      return getQAMemberMetrics(
        data,
        input.owner
      );


    case 'qa_rank_members':

      return getQAMemberRanking(
        data,
        input
      );


    case 'qa_compare_members':

      return compareQAMembers(
        data,
        input.ownerA,
        input.ownerB
      );


    case 'qa_get_category_analysis':

      return getQACategoryAnalysis(
        data,
        input
      );


    case 'qa_get_queue_analysis':

      return getQAQueueAnalysis(
        data,
        input
      );


    case 'qa_get_reviewer_analysis':

      return getQAReviewerAnalysis(
        data,
        input.reviewer || null
      );


    case 'qa_get_cases_by_filters':

      return getQACasesByFilters(
        data,
        input
      );


    case 'qa_get_weekly_status':

      return getQAWeeklyStatusAnalysis(
        data,
        input
      );


    case 'qa_get_dataset_dimensions':

      return getQADatasetDimensions(
        data
      );


    default:

      throw new Error(
        `Unknown QA tool: ${toolName}`
      );
  }
}
// ======================================================
// EXPORTS
// ======================================================

module.exports = {

  QA_TOOLS,

  executeQATool,

  getQAGeneralSummary,

  getQAMemberMetrics,

  getQAMemberRanking,

  compareQAMembers,

  getQACategoryAnalysis,

  getQAQueueAnalysis,

  getQAReviewerAnalysis,

  getQACasesByFilters,

  getQAWeeklyStatusAnalysis,

  getQADatasetDimensions
};