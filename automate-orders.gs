function open_firebase_db() {
  var scriptProperties = PropertiesService.getScriptProperties();
  var email = scriptProperties.getProperty('client_email');
  var key = scriptProperties.getProperty('private_key').replace(/\\n/g, '\n');
  var project_id = scriptProperties.getProperty('project_id');

  var db = FirestoreApp.getFirestore(email, key, project_id);
  return db;
}

function generateUniqueOuterId() {
  var now = new Date();
  var seconds = ("0" + now.getSeconds()).slice(-2); // Get seconds
  var nanoseconds = now.getMilliseconds() * 1000; // Get nanoseconds
  var randomComponent = Math.floor(Math.random() * 987); // Random component

  return `Tanz-${seconds}${nanoseconds}${randomComponent}`;
}

function readDocument(db, collection_name, document_id) {
  var path = collection_name + "/" + document_id;
  return db.getDocument(path);
}

function processOrder(orderData) {
  

  try {

    var db = open_firebase_db();

    var productData = {};
    var cart = {};

    // Fetch product data from Firestore
    orderData.product_ids.forEach(function(id) {
      // Logger.log(`Fetching product data for ID ${id}`);
      var productDoc = readDocument(db, 'products', id);
      // Logger.log(`Fetched productDoc: ${JSON.stringify(productDoc)}`);
      if (productDoc && productDoc.fields) {
        productData[id] = productDoc.fields;
        // Logger.log(`Fetched product data for ID ${id}: ${JSON.stringify(productData[id])}`);
      } else {
        Logger.log(`Product document not found for ID ${id}`);
      }
    });

    // Construct the cart with product details
    orderData.product_ids.forEach(function(id, index) {
      var productInfo = productData[id];
      if (productInfo) {
        cart[id] = {
          title: productInfo.title.stringValue,
          link: productInfo.link.stringValue,
          image: productInfo.image.stringValue,
          quantity: orderData.quantities[index],
          code: productInfo.code.integerValue
        };
        Logger.log(`Added to cart for product ID ${id}: ${JSON.stringify(cart[id])}`);
      } else {
        Logger.log(`Product info not found for ID ${id}`);
      }
    });

    // Generate unique outer_id
    var uniqueOuterId = generateUniqueOuterId();

    // Create new order
    var newOrder = {
      comfirmation_status: 'Pending',
      delivery_status: 'Pending',
      comfirmation_retries: 0,
      full_name: String(orderData.full_name),
      phone_number: String(orderData.phone_number),
      address: String(orderData.address),
      cart: cart,
      outer_id: uniqueOuterId,
      product_ids: orderData.product_ids,
      quantities: orderData.quantities,
      unit_prices: ['11'],
      totalprice: orderData.totalprice,
      status: 'Active',
      createdAt: new Date(),
      updatedAt: new Date(),
      last_call_attempt: new Date(0),
      deleted: false,
      reminded: false,
      createdBy: orderData.userRecord.email,
      userobject: {
        email: orderData.userRecord.email,
        displayName: orderData.userRecord.displayName,
        photoURL: orderData.userRecord.photoURL,
        phoneNumber: orderData.userRecord.phoneNumber
      },
      notified_status: 'Not yet',
      notifiedAt: new Date(),
      notifiedBy: '',
      notifiedCount: 0
    };

    // Uncomment to save to Firestore
    db.createDocument('orders', newOrder);
    Logger.log("New order added to Firestore: " + JSON.stringify(newOrder));

    // Manually increment leads count for each product
    orderData.product_ids.forEach(function(id) {
      var productDoc = readDocument(db, 'products', id);
      if (productDoc && productDoc.fields) {
        var currentLeads = productDoc.fields.leads ? productDoc.fields.leads.integerValue : 0;
        var newLeads = currentLeads + 1;
        mask = true;

        // Use a nested update syntax to ensure only the `leads` field is updated
        db.updateDocument('products/' + id, {
          "fields.leads": {
            integerValue: newLeads
          }
        }, mask);
      }
    });

  } catch (error) {
    Logger.log("Error processing order: " + error.message);
  }
}


function onChange(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1"); // Adjust sheet name
  var lastRow = sheet.getLastRow();
  var scriptProperties = PropertiesService.getScriptProperties();
  var lastProcessedRow = scriptProperties.getProperty('lastProcessedRow') || 0;
  lastProcessedRow = parseInt(lastProcessedRow, 10);

  for (var row = lastProcessedRow + 1; row <= lastRow; row++) {
    var data = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

    var orderData = {
      full_name: data[1],
      phone_number: data[2],
      address: data[3],
      totalprice: data[4],
      product_ids: [data[7]], // product_id
      quantities: [data[5]], // quantity
      userRecord: {
        email: 'system@automation.com',
        displayName: 'System Automation',
        photoURL: '',
        phoneNumber: ''
      }
    };

    processOrder(orderData);
  }

  scriptProperties.setProperty('lastProcessedRow', lastRow);
}