# Publishing data events

Following the steps below to begin publishing data events to the Digital Backbone.

## Step 1 - Identify what data you want to publish

In order to start publishing data, you must first identify the specific data entities from your system that you want to publish, and which events associated with that data (Created, Changed Deleted) that you need to make other systems aware of.

## Step 2 - Find your data event in the catalog

The Digital Backbone API Catalog lists the specific events that are currently supported for publication.  Find your event and review the canonical data model associated with it.

## Step 3 - Determine event detection and exporting approach

There are two approaches to event detection and exporting:

### Native Event Detection and Exporting

Publishing systems with a native event detection and exporting capability need to be configured.  Refer to your system’s documentation or support channels for more information.

### Custom Event Detection and Exporting

Publishing systems without a native event detection and exporting capability must identify a custom approach.  On-premises solutions can often use Change-Data-Capture technology to detect changes in the system’s underlying databases.  SaaS systems and other closed solutions must use approaches in coordination with the vendor.

## Step 4 - Determine adapter approach

There are two approaches to building an adapter:

### Digital Backbone-Provided Template

The Digital Backbone provides a template for adapters which is implemented in Azure Logic Apps.  Using this template makes the process faster and less complex.  Use this approach if you prefer low-code solutions or do not have developers available to build and maintain your adapter.

### Custom Solution

If the Digital Backbone-Provided Template is not a fit, create a custom template in your preferred technology.

## Step 5 - Get ARB approval

The overall Digital Backbone integration approach must be approved by the Architectural Review Board prior to being implemented.  Use the Digital Backbone provided ARB Apporval Template to accelerate this process.

## Step 6 - Setup event detection & exporting

Follow the documentation to setup this capability in your selected event detection and exporting solution (native or custom).  Pay particular attention to the exported data format and export location.  The adapter must be able to access this location.

## Step 7 - Build adapter

To build an adapter using the Digital Backbone Adapter Template, follow these steps:

- Click here to access the tempate
- Create a copy of the template and name it appropriately
- Map fields between the exported data format and that of the relevant canonical data model

## Step 8 - Test integration

There are two ways to test your integration with the Digital Backbone:

### Mock Testing

Use the Mock Testing Framwork to test an adapter while it is being developed.

### Integration Testing

Use the Integration Testing Environment to test an adapter end-to-end before going to production.

## Step 9 - Go to production

Once an integration has been fully tested and approved for production, it may be deployed to production.
